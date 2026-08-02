/**
 * AI command for generating a profile from normalized analyzer output.
 *
 * Read analyzed.json, send it as one complete JSON payload, parse the
 * provider response, and save an immutable result version plus result.json.
 */

import { isAnalyzerOutput, type AnalyzerOutput } from '@/core/analyzer';
import { buildAnalysisRequest } from '@/core/ai';
import type { AIAnalysisResult, ValidationResult } from '@/core/ai';
import {
  checkAnalyzedProvenance,
  completeResultDelivery,
  hashCanonicalJson,
  prepareResultDelivery,
  recordSavedResultVersion,
  type AnalysisState,
  type PendingResultDeliveryState,
  type ResultDeliveryMode,
} from '@/core/provenance';
import type { ResultVersionMetadata, ResultVersionSource } from '@/core/result-version';
import {
  DEFAULT_CONFIG,
  getConfig,
  resolveCodexConfig,
  resolveGeminiConfig,
  type AIProviderId,
  type V2erConfig,
} from '@/config';
import {
  AISessionMigrationConflictError,
  AISessionMigrationFailedError,
  AISessionPersistError,
  AISessionStoreCorruptError,
  cleanExpiredData,
  CodexExecutionLockBusyError,
  recoverGeminiAnalysisSession,
  recoverResultVersionDelivery,
  readAnalysisState,
  readDataFile,
  saveResultVersion,
  type AnalysisStateReadResult,
  updateAnalysisState,
  withCodexExecutionLock,
} from '@/infra/storage';
import { logger } from '@/infra/logger';
import type { AiCommandOptions } from '../types';
import { getRecoveryActions } from '../workflow/recovery';
import type { ReasonCode, StepRunResult } from '../workflow/types';
import { extractErrorDetails } from '../utils/error';
import { createDataFilesCleanedNotice } from '../workflow/data-retention-notices';
import { executeCodexAnalysis, inspectCodexResultDeliverySession } from './ai/codex';
import { classifyCodexFailure } from './ai/codex-errors';
import { executeGeminiAnalysis } from './ai/gemini';
import { AiProviderOptionError, resolveAiProviderOptions } from './ai/provider-options';
import packageJson from '../../../package.json';

function classifyCodexSessionPersistenceFailure(error: unknown): ReasonCode {
  const reasonCode = classifyCodexFailure(error);
  return reasonCode === 'SESSION_MIGRATION_CONFLICT' || reasonCode === 'SESSION_MIGRATION_FAILED'
    ? reasonCode
    : 'AI_CODEX_SESSION_UPDATE_FAILED';
}

function classifyGeminiSessionFailure(error: unknown): ReasonCode {
  if (error instanceof AISessionMigrationConflictError) return 'SESSION_MIGRATION_CONFLICT';
  if (error instanceof AISessionMigrationFailedError) return 'SESSION_MIGRATION_FAILED';
  if (error instanceof AISessionPersistError || error instanceof AISessionStoreCorruptError) {
    return 'SESSION_PERSIST_FAILED';
  }
  return 'AI_PROVIDER_FAILED';
}

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

  let execute: () => Promise<StepRunResult>;
  if (selectedProvider === 'gemini') {
    const initialAnalysisState = readAnalysisState(username);
    execute = () =>
      runAiForProvider(username, options, analyzed, config, selectedProvider, initialAnalysisState);
  } else {
    execute = () => runAiForProvider(username, options, analyzed, config, selectedProvider);
  }

  try {
    return await withCodexExecutionLock(username, execute);
  } catch (error) {
    if (error instanceof CodexExecutionLockBusyError) {
      const reasonCode = selectedProvider === 'codex' ? 'AI_CODEX_BUSY' : 'SESSION_BUSY';
      logger.warn(`${username} 的 AI 分析正在由另一个进程处理`);
      return {
        step: 'ai',
        status: 'failed',
        reasonCode,
        message: '同一用户已有 AI 分析正在执行',
        recoverable: true,
        recoverActions: getRecoveryActions(reasonCode, { username }),
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
    const reasonCode =
      selectedProvider === 'codex' ? 'AI_CODEX_LOCK_FAILED' : 'SESSION_PERSIST_FAILED';
    logger.error(`AI 执行锁失败: ${message}`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode,
      message: `AI 执行锁失败: ${message}`,
      recoverable: true,
      recoverActions: getRecoveryActions(reasonCode, { username }),
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
  initialAnalysisState?: AnalysisStateReadResult,
): Promise<StepRunResult> {
  const analysisState = initialAnalysisState ?? readAnalysisState(username);
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
  let savedResult = readDataFile<unknown>(username, 'result');
  if (provenance.basedOnPartial) {
    logger.warn('当前分析基于不完整抓取数据；缺失记录状态未知');
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

  let providerAnalysisState = analysisState.state;
  let model: string;
  let result: AIAnalysisResult;
  let delivery: PendingResultDeliveryState;
  let resultVersionSource: ResultVersionSource | undefined;
  let recoveredResultMetadata: ResultVersionMetadata | undefined;
  let completeAnalysisSession: ((metadata: ResultVersionMetadata) => Promise<void>) | undefined;
  let warnings: ValidationResult['warnings'] = [];

  const pendingBeforeProvider = providerAnalysisState.pendingResultDelivery;
  if (pendingBeforeProvider) {
    // Recover the immutable result before deciding whether another provider call is necessary.
    let recovered;
    try {
      recovered = recoverResultVersionDelivery(username, pendingBeforeProvider);
    } catch (error) {
      const { message, raw } = extractErrorDetails(error);
      logger.error(`恢复 AI 分析结果失败: ${message}`);
      return {
        step: 'ai',
        status: 'failed',
        reasonCode: 'AI_RESULT_WRITE_FAILED',
        message: `无法恢复已写入的 AI 结果版本: ${message}`,
        recoverable: true,
        recoverActions: getRecoveryActions('AI_RESULT_WRITE_FAILED', { username }),
        meta: { rawError: raw },
      };
    }

    if (recovered.status === 'recovered') {
      try {
        providerAnalysisState = updateAnalysisState(username, (state) =>
          recordSavedResultVersion(state, recovered.metadata),
        );
        savedResult = recovered.result;

        if (recovered.metadata.provider === 'codex') {
          const localSessionId = recovered.metadata.localSessionId;
          if (!localSessionId) {
            throw new Error('Saved Codex result does not identify its local session');
          }
          const sessionStatus = inspectCodexResultDeliverySession(
            username,
            pendingBeforeProvider,
            localSessionId,
          );
          if (sessionStatus === 'completed') {
            providerAnalysisState = updateAnalysisState(username, (state) =>
              completeResultDelivery(state, pendingBeforeProvider.deliveryId),
            );
          } else {
            recoveredResultMetadata = recovered.metadata;
          }
        } else if (recovered.metadata.provider === 'gemini') {
          const reasoningLevel = recovered.metadata.reasoningLevel;
          if (
            recovered.metadata.promptHash !== request.promptHash ||
            typeof reasoningLevel !== 'string'
          ) {
            throw new Error('Saved Gemini result does not match the current analysis prompt');
          }
          recoverGeminiAnalysisSession({
            username,
            metadata: recovered.metadata,
            requestPayload: request.payload,
            systemInstruction: request.systemPrompt,
            result: recovered.result,
            thinkingLevel: reasoningLevel,
          });
          providerAnalysisState = updateAnalysisState(username, (state) =>
            completeResultDelivery(state, pendingBeforeProvider.deliveryId),
          );
        } else {
          providerAnalysisState = updateAnalysisState(username, (state) =>
            completeResultDelivery(state, pendingBeforeProvider.deliveryId),
          );
        }
      } catch (error) {
        const { message, raw } = extractErrorDetails(error);
        const provider = recovered.metadata.provider;
        const isCodex = provider === 'codex';
        const reasonCode = isCodex
          ? classifyCodexSessionPersistenceFailure(error)
          : provider === 'gemini'
            ? 'SESSION_PERSIST_FAILED'
            : 'PROVENANCE_UPDATE_FAILED';
        logger.error(`协调已保存的 AI 结果状态失败: ${message}`);
        return {
          step: 'ai',
          status: 'failed',
          reasonCode,
          message: `AI 结果版本已恢复，但${provider === 'unknown' ? ' provenance' : ` ${provider} session`} 状态更新失败: ${message}`,
          recoverable: true,
          recoverActions: getRecoveryActions(reasonCode, { username }),
          meta: { rawError: raw, resultVersionId: recovered.metadata.versionId },
        };
      }
    }
  }

  if (
    selectedProvider !== 'codex' &&
    providerAnalysisState.pendingResultDelivery?.providerKey.startsWith('codex:')
  ) {
    logger.error('存在尚未完成的 Codex 结果投递');
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_CODEX_SESSION_UPDATE_FAILED',
      message: '请先重新运行 Codex 分析以完成已接受的结果投递',
      recoverable: true,
      recoverActions: getRecoveryActions('AI_CODEX_SESSION_UPDATE_FAILED', { username }),
    };
  }

  if (selectedProvider === 'codex') {
    const codexConfig = resolveCodexConfig(config.ai);
    logger.info(`\nAI 分析: ${username} (Provider: Codex)`);
    try {
      const execution = await executeCodexAnalysis({
        username,
        config: codexConfig,
        request,
        analysisState: providerAnalysisState,
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

      try {
        const { deliveryId, ...deliveryTarget } = execution.delivery;
        providerAnalysisState = updateAnalysisState(username, (state) => {
          assertAnalyzedProvenanceUnchanged(state);
          const prepared = prepareResultDelivery(state, deliveryTarget, () => deliveryId);
          if (prepared.pendingResultDelivery?.deliveryId !== deliveryId) {
            throw new Error('Codex delivery ID conflicts with analysis-state.json');
          }
          return prepared;
        });
      } catch (error) {
        const { message, raw } = extractErrorDetails(error);
        logger.error(`准备 Codex 结果投递状态失败: ${message}`);
        return {
          step: 'ai',
          status: 'failed',
          reasonCode: 'PROVENANCE_UPDATE_FAILED',
          message: `Codex 已返回结果，但 provenance 状态更新失败: ${message}`,
          recoverable: true,
          recoverActions: getRecoveryActions('PROVENANCE_UPDATE_FAILED', { username }),
          meta: { rawError: raw },
        };
      }

      const prepared = providerAnalysisState.pendingResultDelivery;
      if (!prepared) throw new Error('Codex result delivery preparation was not persisted');
      model = execution.model;
      result = execution.result;
      delivery = prepared;
      resultVersionSource = {
        deliveryId: prepared.deliveryId,
        origin: prepared.deliveryMode === 'resend' ? 'resend' : 'analysis',
        createdAt: new Date().toISOString(),
        provider: 'codex',
        model: execution.model,
        reasoningLevel: execution.reasoningEffort,
        localSessionId: execution.localSessionId,
        externalThreadId: execution.threadId,
        threadName: execution.threadName,
        promptHash: request.promptHash,
        analysisFingerprint: prepared.analysisFingerprint,
        payloadHash: prepared.payloadHash,
        dataQuality: prepared.basedOnPartial ? 'partial' : 'complete',
        warningCount: 0,
        appVersion: packageJson.version,
      };
      completeAnalysisSession = async () => execution.complete();
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
    let preparationFailed = false;
    try {
      execution = await executeGeminiAnalysis({
        username,
        config: geminiConfig,
        request,
        analysisState: providerAnalysisState,
        provenance,
        savedResult,
        ...(configuredModel ? { model: configuredModel } : {}),
        ...(configuredThinkingLevel ? { thinkingLevel: configuredThinkingLevel } : {}),
        newThread: options.newThread,
        resend: options.resend,
        prepareDelivery: (target) => {
          try {
            providerAnalysisState = updateAnalysisState(username, (state) => {
              assertAnalyzedProvenanceUnchanged(state);
              return prepareResultDelivery(state, target);
            });
          } catch (error) {
            preparationFailed = true;
            throw error;
          }

          const prepared = providerAnalysisState.pendingResultDelivery;
          if (!prepared) throw new Error('Gemini result delivery preparation was not persisted');
          return prepared;
        },
      });
    } catch (error) {
      const { message, raw } = extractErrorDetails(error);
      if (preparationFailed) {
        logger.error(`准备 AI 结果投递状态失败: ${message}`);
        return {
          step: 'ai',
          status: 'failed',
          reasonCode: 'PROVENANCE_UPDATE_FAILED',
          message: `AI 请求未发送，provenance 状态更新失败: ${message}`,
          recoverable: true,
          recoverActions: getRecoveryActions('PROVENANCE_UPDATE_FAILED', { username }),
          meta: { rawError: raw },
        };
      }
      if (!options.pipeline) {
        logger.error(`AI 单次分析请求失败: ${message}`);
        logger.debug(raw);
      }
      const reasonCode = classifyGeminiSessionFailure(error);
      return {
        step: 'ai',
        status: 'failed',
        reasonCode,
        message: `AI 分析失败: ${message}`,
        recoverable: true,
        recoverActions: getRecoveryActions(reasonCode, { username }),
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
    resultVersionSource = {
      deliveryId: delivery.deliveryId,
      origin: delivery.deliveryMode === 'resend' ? 'resend' : 'analysis',
      createdAt: new Date().toISOString(),
      provider: 'gemini',
      model,
      reasoningLevel: execution.thinkingLevel,
      localSessionId: execution.localSessionId,
      externalThreadId: null,
      threadName: null,
      promptHash: request.promptHash,
      analysisFingerprint: delivery.analysisFingerprint,
      payloadHash: delivery.payloadHash,
      dataQuality: delivery.basedOnPartial ? 'partial' : 'complete',
      warningCount: warnings.length,
      appVersion: packageJson.version,
    };
    completeAnalysisSession = async (metadata) => execution.complete(metadata);
  }

  if (warnings.length > 0) {
    logger.section('AI 响应警告:');
    for (const warning of warnings) {
      logger.warn(`  ${warning}`);
    }
  }

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
      message: `结果版本未写入，provenance 状态校验失败: ${message}`,
      recoverable: true,
      recoverActions: getRecoveryActions('PROVENANCE_UPDATE_FAILED', { username }),
      meta: { rawError: raw },
    };
  }

  let metadata = recoveredResultMetadata;
  if (metadata) {
    if (
      metadata.deliveryId !== delivery.deliveryId ||
      metadata.resultHash !== hashCanonicalJson(result)
    ) {
      logger.error('恢复的 AI 结果与已保存版本不一致');
      return {
        step: 'ai',
        status: 'failed',
        reasonCode: 'AI_RESULT_WRITE_FAILED',
        message: `AI 结果与已保存版本 ${metadata.versionId} 不一致`,
        recoverable: true,
        recoverActions: getRecoveryActions('AI_RESULT_WRITE_FAILED', { username }),
        meta: { resultVersionId: metadata.versionId },
      };
    }
  } else {
    if (!resultVersionSource) {
      throw new Error('AI result is missing version source metadata');
    }
    try {
      metadata = saveResultVersion(username, result, resultVersionSource);
    } catch (error) {
      const { message, raw } = extractErrorDetails(error);
      logger.error(`保存 AI 分析结果版本失败: ${message}`);
      return {
        step: 'ai',
        status: 'failed',
        reasonCode: 'AI_RESULT_WRITE_FAILED',
        message: `AI 已返回结果，但结果版本保存失败: ${message}`,
        recoverable: true,
        recoverActions: getRecoveryActions('AI_RESULT_WRITE_FAILED', { username }),
        meta: { rawError: raw },
      };
    }
  }

  try {
    updateAnalysisState(username, (state) => recordSavedResultVersion(state, metadata));
  } catch (error) {
    const { message, raw } = extractErrorDetails(error);
    logger.error(`记录 AI 结果版本状态失败: ${message}`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'PROVENANCE_UPDATE_FAILED',
      message: `AI 结果版本 ${metadata.versionId} 已保存，provenance 状态更新失败: ${message}`,
      recoverable: true,
      recoverActions: getRecoveryActions('PROVENANCE_UPDATE_FAILED', { username }),
      meta: { rawError: raw, resultVersionId: metadata.versionId },
    };
  }

  if (completeAnalysisSession) {
    try {
      await completeAnalysisSession(metadata);
    } catch (error) {
      const { message, raw } = extractErrorDetails(error);
      const provider = resultVersionSource?.provider;
      const reasonCode =
        provider === 'codex'
          ? classifyCodexSessionPersistenceFailure(error)
          : 'SESSION_PERSIST_FAILED';
      logger.error(`更新 AI session 状态失败: ${message}`);
      return {
        step: 'ai',
        status: 'failed',
        reasonCode,
        message: `AI 结果版本 ${metadata.versionId} 已保存，${provider ?? 'AI'} session 状态更新失败: ${message}`,
        recoverable: true,
        recoverActions: getRecoveryActions(reasonCode, { username }),
        meta: { rawError: raw, resultVersionId: metadata.versionId },
      };
    }
  }

  try {
    updateAnalysisState(username, (state) => completeResultDelivery(state, delivery.deliveryId));
  } catch (error) {
    const { message, raw } = extractErrorDetails(error);
    logger.error(`完成 AI provenance 状态失败: ${message}`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'PROVENANCE_UPDATE_FAILED',
      message: `AI 结果版本 ${metadata.versionId} 已保存，最终 provenance 状态更新失败: ${message}`,
      recoverable: true,
      recoverActions: getRecoveryActions('PROVENANCE_UPDATE_FAILED', { username }),
      meta: { rawError: raw, resultVersionId: metadata.versionId },
    };
  }

  return finishAiSuccess(
    username,
    options,
    model,
    selectedProvider,
    warnings.length,
    delivery.deliveryMode,
    metadata.versionId,
  );
}

function finishAiSuccess(
  username: string,
  options: AiCommandOptions,
  model: string,
  provider: AIProviderId,
  warningCount: number,
  deliveryMode: ResultDeliveryMode,
  resultVersionId: string,
): StepRunResult {
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
      provider,
      warningCount,
      cleanedFiles: cleaned,
      deliveryMode,
      resultVersionId,
    },
    notices: cleanupNotice ? [cleanupNotice] : undefined,
  };
}
