/**
 * AI command for generating a profile from normalized analyzer output.
 *
 * Read analyzed.json, send it as one complete JSON payload, parse the
 * provider response, and persist result.json.
 */

import { isAnalyzerOutput, type AnalyzerOutput } from '@/core/analyzer';
import { buildAnalysisRequest } from '@/core/ai';
import type { AIAnalysisResult, ValidationResult } from '@/core/ai';
import {
  checkAnalyzedProvenance,
  recordProviderDelivery,
  type AnalysisState,
  type ProviderDeliveryRecordInput,
} from '@/core/provenance';
import {
  DEFAULT_CONFIG,
  getConfig,
  resolveCodexConfig,
  resolveGeminiConfig,
  type AIProviderId,
  type V2erConfig,
} from '@/config';
import {
  cleanExpiredData,
  CodexExecutionLockBusyError,
  DataFilePostWriteError,
  readAnalysisState,
  readDataFile,
  updateAnalysisState,
  withCodexExecutionLock,
  writeDataFileWithRollback,
} from '@/infra/storage';
import { logger } from '@/infra/logger';
import type { AiCommandOptions } from '../types';
import { getRecoveryActions } from '../workflow/recovery';
import type { StepRunResult } from '../workflow/types';
import { extractErrorDetails } from '../utils/error';
import { createDataFilesCleanedNotice } from '../workflow/data-retention-notices';
import { executeCodexAnalysis } from './ai/codex';
import { classifyCodexFailure } from './ai/codex-errors';
import { executeGeminiAnalysis } from './ai/gemini';
import { AiProviderOptionError, resolveAiProviderOptions } from './ai/provider-options';

/**
 * Run the AI analysis command for one user.
 *
 * @param username - Target V2EX username.
 * @param options - Per-command model, thinking, resend, and pipeline overrides.
 * @returns The workflow result for the AI step.
 */
export async function runAi(username: string, options: AiCommandOptions): Promise<StepRunResult> {
  const analyzedValue = readDataFile<unknown>(username, 'analyzed');

  if (analyzedValue === null) {
    logger.error(`未找到 ${username} 的分析数据`);
    logger.info('请先运行: v2er analyze <username>');
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_INPUT_MISSING',
      message: '缺少 analyzed.json，无法执行 AI 分析',
      recoverable: true,
      recoverActions: getRecoveryActions('AI_INPUT_MISSING', { username }),
    };
  }

  if (!isAnalyzerOutput(analyzedValue)) {
    logger.error(`${username} 的 analyzed.json 格式无效或不受支持`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_INPUT_INVALID',
      message: 'analyzed.json 格式无效或不受支持，无法执行 AI 分析',
      recoverable: true,
      recoverActions: getRecoveryActions('AI_INPUT_INVALID', { username }),
    };
  }
  const analyzed = analyzedValue;

  const config = getConfig();
  let selectedProvider: ReturnType<typeof resolveAiProviderOptions>;
  try {
    selectedProvider = resolveAiProviderOptions(
      config.ai?.provider ?? DEFAULT_CONFIG.ai.provider,
      options,
    );
  } catch (error) {
    const { message } = extractErrorDetails(error);
    logger.error(message);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_INVALID_PROVIDER_OPTIONS',
      message,
      recoverable: false,
      recoverActions: getRecoveryActions('AI_INVALID_PROVIDER_OPTIONS', { username }),
      meta: {
        optionErrorCode: error instanceof AiProviderOptionError ? error.code : undefined,
      },
    };
  }

  const execute = () => runAiForProvider(username, options, analyzed, config, selectedProvider);
  if (selectedProvider === 'gemini') return execute();

  try {
    return await withCodexExecutionLock(username, execute);
  } catch (error) {
    if (error instanceof CodexExecutionLockBusyError) {
      logger.warn(`${username} 的 Codex 分析正在由另一个进程处理`);
      return {
        step: 'ai',
        status: 'failed',
        reasonCode: 'AI_CODEX_BUSY',
        message: '同一用户已有 Codex 分析正在执行',
        recoverable: true,
        recoverActions: getRecoveryActions('AI_CODEX_BUSY', { username }),
        meta:
          error.state.status === 'locked'
            ? {
                lockOwnerPid: error.state.owner.pid,
                lockAcquiredAt: error.state.owner.acquiredAt,
              }
            : { lockState: 'invalid' },
      };
    }

    const { message, raw } = extractErrorDetails(error);
    logger.error(`Codex 执行锁失败: ${message}`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_CODEX_LOCK_FAILED',
      message: `Codex 执行锁失败: ${message}`,
      recoverable: true,
      recoverActions: getRecoveryActions('AI_CODEX_LOCK_FAILED', { username }),
      meta: { rawError: raw },
    };
  }
}

async function runAiForProvider(
  username: string,
  options: AiCommandOptions,
  analyzed: AnalyzerOutput,
  config: V2erConfig,
  selectedProvider: AIProviderId,
): Promise<StepRunResult> {
  const analysisState = readAnalysisState(username);
  if (analysisState.status === 'invalid') {
    logger.error(`${username} 的 analysis-state.json 无效或不可读`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'PROVENANCE_STATE_INVALID',
      message: 'analysis-state.json 无效或不可读，无法验证 AI 输入来源',
      recoverable: true,
      recoverActions: getRecoveryActions('PROVENANCE_STATE_INVALID', { username }),
    };
  }

  if (analysisState.status === 'missing') {
    logger.error(`${username} 的 analyzed.json 缺少 provenance 状态`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_PROVENANCE_MISSING',
      message: 'analyzed.json 缺少 provenance，无法安全判断重复发送',
      recoverable: true,
      recoverActions: getRecoveryActions('AI_PROVENANCE_MISSING', { username }),
    };
  }

  let provenance;
  try {
    provenance = checkAnalyzedProvenance(analysisState.state, analyzed, config.analyzer);
  } catch (error) {
    const { message } = extractErrorDetails(error);
    logger.error(`验证 analyzed provenance 失败: ${message}`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_SOURCE_MISMATCH',
      message: `无法验证 analyzed provenance: ${message}`,
      recoverable: true,
      recoverActions: getRecoveryActions('AI_SOURCE_MISMATCH', { username }),
    };
  }

  if (provenance.status === 'missing') {
    logger.error(`${username} 的 analyzed.json 缺少完整 provenance`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_PROVENANCE_MISSING',
      message: 'analyzed.json 缺少完整 provenance，无法安全判断重复发送',
      recoverable: true,
      recoverActions: getRecoveryActions('AI_PROVENANCE_MISSING', { username }),
    };
  }

  if (provenance.status === 'mismatch') {
    logger.error(`${username} 的 analyzed.json 与 provenance 状态不匹配`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_SOURCE_MISMATCH',
      message: 'analyzed.json 与 provenance 状态不匹配，需要重新分析',
      recoverable: true,
      recoverActions: getRecoveryActions('AI_SOURCE_MISMATCH', { username }),
    };
  }

  const request = buildAnalysisRequest(analyzed);
  const savedResult = readDataFile<unknown>(username, 'result');
  if (provenance.basedOnPartial) {
    logger.warn('当前分析基于不完整抓取数据；缺失记录状态未知');
  }

  let model: string;
  let result: AIAnalysisResult;
  let delivery: ProviderDeliveryRecordInput;
  let completeCodexSession: (() => Promise<void>) | undefined;
  let warnings: ValidationResult['warnings'] = [];

  if (selectedProvider === 'codex') {
    const codexConfig = resolveCodexConfig(config.ai);
    logger.info(`\nAI 分析: ${username} (Provider: Codex)`);
    try {
      const execution = await executeCodexAnalysis({
        username,
        config: codexConfig,
        request,
        analysisState: analysisState.state,
        provenance,
        savedResult,
        ...(typeof options.model === 'string' ? { model: options.model } : {}),
        ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
        ...(options.codexProject ? { codexProject: options.codexProject } : {}),
        ...(config.proxy ? { proxyUrl: config.proxy } : {}),
        newThread: options.newThread,
        resend: options.resend,
      });
      if (execution.status === 'skipped') {
        logger.info('分析数据未发生有效变化，跳过 Codex 调用');
        return {
          step: 'ai',
          status: 'skipped',
          message: '分析数据未发生有效变化',
          meta: {
            provider: 'codex',
            model: execution.model,
            threadId: execution.threadId,
            analysisFingerprint: provenance.analysisFingerprint,
          },
        };
      }
      if (execution.status === 'busy') {
        logger.warn(`Codex 任务 ${execution.threadId} 仍有活动回合`);
        return {
          step: 'ai',
          status: 'failed',
          reasonCode: 'AI_CODEX_BUSY',
          message: 'Codex 任务仍有活动回合，分析数据未发送',
          recoverable: true,
          recoverActions: getRecoveryActions('AI_CODEX_BUSY', { username }),
          meta: { threadId: execution.threadId, turnId: execution.turnId },
        };
      }

      model = execution.model;
      result = execution.result;
      delivery = execution.delivery;
      completeCodexSession = execution.complete;
      logger.detail(`模型: ${execution.model}`);
      logger.detail(`思考深度: ${execution.reasoningEffort}`);
      logger.detail(`任务: ${execution.threadId}`);
    } catch (error) {
      const { message, raw } = extractErrorDetails(error);
      const reasonCode = classifyCodexFailure(error);
      if (!options.pipeline) {
        logger.error(`Codex 分析请求失败: ${message}`);
        logger.debug(raw);
      }
      return {
        step: 'ai',
        status: 'failed',
        reasonCode,
        message: `Codex 分析失败: ${message}`,
        recoverable: true,
        recoverActions: getRecoveryActions(reasonCode, { username }),
        meta: { rawError: raw },
      };
    }
  } else {
    const geminiConfig = resolveGeminiConfig(config.ai);
    const configuredModel = typeof options.model === 'string' ? options.model : undefined;
    const configuredThinkingLevel =
      typeof options.thinkingLevel === 'string' ? options.thinkingLevel : undefined;
    let execution: Awaited<ReturnType<typeof executeGeminiAnalysis>>;
    try {
      execution = await executeGeminiAnalysis({
        username,
        config: geminiConfig,
        request,
        analysisState: analysisState.state,
        provenance,
        savedResult,
        ...(configuredModel ? { model: configuredModel } : {}),
        ...(configuredThinkingLevel ? { thinkingLevel: configuredThinkingLevel } : {}),
        resend: options.resend,
      });
    } catch (error) {
      const { message, raw } = extractErrorDetails(error);
      if (!options.pipeline) {
        logger.error(`AI 单次分析请求失败: ${message}`);
        logger.debug(raw);
      }
      return {
        step: 'ai',
        status: 'failed',
        reasonCode: 'AI_PROVIDER_FAILED',
        message: `AI 分析失败: ${message}`,
        recoverable: true,
        recoverActions: getRecoveryActions('AI_PROVIDER_FAILED', { username }),
        meta: { rawError: raw },
      };
    }
    model = execution.model;
    if (execution.status === 'invalidThinkingLevel') {
      logger.error(`无效的思考等级: "${execution.value}"`);
      return {
        step: 'ai',
        status: 'failed',
        reasonCode: 'AI_INVALID_THINKING_LEVEL',
        message: `无效的 thinkingLevel: ${execution.value}`,
        recoverable: false,
        recoverActions: getRecoveryActions('AI_INVALID_THINKING_LEVEL', { username }),
      };
    }
    if (execution.status === 'apiKeyMissing') {
      logger.error('未找到 API Key');
      logger.info('请通过以下方式之一配置:');
      logger.detail('1. 环境变量: GOOGLE_API_KEY 或 GEMINI_API_KEY');
      logger.detail('2. 配置文件: v2er config ai.gemini.apiKey <key>');
      return {
        step: 'ai',
        status: 'failed',
        reasonCode: 'AI_API_KEY_MISSING',
        message: '缺少 API Key，无法发起 AI 请求',
        recoverable: true,
        recoverActions: getRecoveryActions('AI_API_KEY_MISSING', { username }),
      };
    }
    if (execution.status === 'skipped') {
      logger.info('分析数据未发生有效变化，跳过 AI 调用');
      return {
        step: 'ai',
        status: 'skipped',
        message: '分析数据未发生有效变化',
        meta: { model, analysisFingerprint: provenance.analysisFingerprint },
      };
    }
    result = execution.result;
    warnings = execution.warnings;
    delivery = execution.delivery;
  }

  if (warnings.length > 0) {
    logger.section('AI 响应警告:');
    for (const warning of warnings) {
      logger.warn(`  ${warning}`);
    }
  }

  const assertAnalyzedProvenanceUnchanged = (state: AnalysisState): void => {
    const latest = checkAnalyzedProvenance(state, analyzed, config.analyzer);
    if (
      latest.status !== 'valid' ||
      latest.analysisFingerprint !== provenance.analysisFingerprint ||
      latest.payloadHash !== provenance.payloadHash
    ) {
      throw new Error('analyzed provenance changed during AI delivery');
    }
  };

  try {
    const stateBeforeWrite = readAnalysisState(username);
    if (stateBeforeWrite.status !== 'valid') {
      throw new Error('analysis state changed during AI delivery');
    }
    assertAnalyzedProvenanceUnchanged(stateBeforeWrite.state);
  } catch (error) {
    const { message, raw } = extractErrorDetails(error);
    logger.error(`提交 AI provenance 状态失败: ${message}`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'PROVENANCE_UPDATE_FAILED',
      message: `result.json 未变更，provenance 状态校验失败: ${message}`,
      recoverable: true,
      recoverActions: getRecoveryActions('PROVENANCE_UPDATE_FAILED', { username }),
      meta: { rawError: raw },
    };
  }

  try {
    writeDataFileWithRollback(username, 'result', result, () => {
      updateAnalysisState(username, (state) => {
        assertAnalyzedProvenanceUnchanged(state);

        return recordProviderDelivery(state, delivery);
      });
    });
  } catch (error) {
    const { message, raw } = extractErrorDetails(error);

    if (error instanceof DataFilePostWriteError) {
      const resultState =
        error.rollbackError === undefined
          ? 'result.json 已恢复原内容'
          : 'result.json 回滚失败，请保留当前数据用于诊断';
      logger.error(`提交 AI provenance 状态失败: ${message}`);
      return {
        step: 'ai',
        status: 'failed',
        reasonCode: 'PROVENANCE_UPDATE_FAILED',
        message: `${resultState}；provenance 状态更新失败: ${message}`,
        recoverable: true,
        recoverActions: getRecoveryActions('PROVENANCE_UPDATE_FAILED', { username }),
        meta: { rawError: raw },
      };
    }

    logger.error(`保存 AI 分析结果失败: ${message}`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_RESULT_WRITE_FAILED',
      message: `AI 已返回结果，但 result.json 保存失败: ${message}`,
      recoverable: true,
      recoverActions: getRecoveryActions('AI_RESULT_WRITE_FAILED', { username }),
      meta: { rawError: raw },
    };
  }

  if (completeCodexSession) {
    try {
      await completeCodexSession();
    } catch (error) {
      const { message, raw } = extractErrorDetails(error);
      logger.error(`更新 Codex session 状态失败: ${message}`);
      return {
        step: 'ai',
        status: 'failed',
        reasonCode: 'AI_CODEX_SESSION_UPDATE_FAILED',
        message: `AI 结果已保存，Codex session 状态更新失败: ${message}`,
        recoverable: true,
        recoverActions: getRecoveryActions('AI_CODEX_SESSION_UPDATE_FAILED', { username }),
        meta: { rawError: raw },
      };
    }
  }

  const cleanup = cleanExpiredData(username);
  const cleaned = cleanup.deleted;
  const cleanupNotice = createDataFilesCleanedNotice(username, cleanup);

  if (!options.pipeline) {
    logger.success('分析结果已保存');
  }

  return {
    step: 'ai',
    status: 'success',
    message: 'AI 分析完成',
    meta: {
      model,
      provider: selectedProvider,
      warningCount: warnings.length,
      cleanedFiles: cleaned,
      deliveryMode: delivery.deliveryMode,
    },
    notices: cleanupNotice ? [cleanupNotice] : undefined,
  };
}
