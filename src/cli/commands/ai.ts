/**
 * AI command for generating a profile from normalized analyzer output.
 *
 * Read analyzed.json, send it as one complete JSON payload, parse the
 * provider response, and persist result.json.
 */

import { isAnalyzerOutput } from '@/core/analyzer';
import {
  GeminiProvider,
  buildAnalysisRequest,
  parseResponse,
  resolveApiKey,
  withRetry,
} from '@/core/ai';
import type { ValidationResult } from '@/core/ai';
import {
  checkAnalyzedProvenance,
  computeProviderStateKey,
  hasProviderReceivedAnalysis,
  recordProviderDelivery,
} from '@/core/provenance';
import { getConfig, THINKING_LEVELS, DEFAULT_CONFIG } from '@/config';
import type { ThinkingLevel } from '@/config';
import {
  cleanExpiredData,
  readAnalysisState,
  readDataFile,
  updateAnalysisState,
  writeDataFile,
} from '@/infra/storage';
import { logger } from '@/infra/logger';
import type { AiCommandOptions } from '../types';
import { getRecoveryActions } from '../workflow/recovery';
import type { StepRunResult } from '../workflow/types';
import { extractErrorDetails } from '../utils/error';

const GEMINI_LOGICAL_SESSION_KEY = 'default';

function isThinkingLevel(value: string): value is ThinkingLevel {
  return THINKING_LEVELS.some((level) => level === value);
}

/**
 * Run the AI analysis command for one user.
 *
 * @param username - V2EX username whose analyzed data should be processed.
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

  // Commander 将 --model [name] 无值时解析为 true；
  // 字符串时直接使用，否则回退到配置/默认值（后续支持交互选择时替换此逻辑）
  const model =
    typeof options.model === 'string'
      ? options.model
      : (config.ai?.model ?? DEFAULT_CONFIG.ai.model);

  // 同上：--thinking-level [level] 无值时为 true，字符串时直接使用
  const rawThinkingLevel =
    typeof options.thinkingLevel === 'string' ? options.thinkingLevel : config.ai?.thinkingLevel;

  if (rawThinkingLevel && !isThinkingLevel(rawThinkingLevel)) {
    logger.error(`无效的思考等级: "${rawThinkingLevel}"`);
    logger.info(`可选值: ${THINKING_LEVELS.join(' | ')}`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_INVALID_THINKING_LEVEL',
      message: `无效的 thinkingLevel: ${rawThinkingLevel}`,
      recoverable: false,
      recoverActions: getRecoveryActions('AI_INVALID_THINKING_LEVEL', { username }),
    };
  }
  const thinkingLevel = rawThinkingLevel;

  logger.info(`\nAI 分析: ${username} (模型: ${model})`);
  if (thinkingLevel) {
    logger.detail(`思考等级: ${thinkingLevel}`);
  }

  // Build once so delivery identity and transmitted content use the same prompt and payload.
  const request = buildAnalysisRequest(analyzed);
  const providerKey = computeProviderStateKey({
    provider: 'gemini',
    model,
    systemPrompt: request.systemPrompt,
    thinkingLevel,
    sessionKey: GEMINI_LOGICAL_SESSION_KEY,
  });
  const providerAlreadyReceived = hasProviderReceivedAnalysis(
    analysisState.state,
    providerKey,
    provenance.analysisFingerprint,
  );
  const currentResultIsReusable =
    !options.resend &&
    providerAlreadyReceived &&
    analysisState.state.currentResult?.analysisFingerprint === provenance.analysisFingerprint &&
    !analysisState.state.currentResult.stale &&
    readDataFile<unknown>(username, 'result') !== null;

  if (currentResultIsReusable) {
    logger.info('分析数据未发生有效变化，跳过 AI 调用');
    return {
      step: 'ai',
      status: 'skipped',
      message: '分析数据未发生有效变化',
      meta: {
        model,
        analysisFingerprint: provenance.analysisFingerprint,
      },
    };
  }

  const apiKey = resolveApiKey();
  if (!apiKey) {
    logger.error('未找到 API Key');
    logger.info('请通过以下方式之一配置:');
    logger.detail('1. 环境变量: GOOGLE_API_KEY 或 GEMINI_API_KEY');
    logger.detail('2. 配置文件: v2er config ai.apiKey <key>');
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_API_KEY_MISSING',
      message: '缺少 API Key，无法发起 AI 请求',
      recoverable: true,
      recoverActions: getRecoveryActions('AI_API_KEY_MISSING', { username }),
    };
  }

  if (provenance.basedOnPartial) {
    logger.warn('当前分析基于不完整抓取数据，缺失记录不能解释为删除');
  }

  const provider = new GeminiProvider(apiKey, model);

  const retryOptions = {
    maxRetries: config.ai?.maxRetries ?? DEFAULT_CONFIG.ai.maxRetries,
    baseDelay: config.ai?.baseDelay ?? DEFAULT_CONFIG.ai.baseDelay,
    maxDelay: config.ai?.maxDelay ?? DEFAULT_CONFIG.ai.maxDelay,
    onRetry: (attempt: number, maxRetries: number, error: Error, delay: number) => {
      const delaySec = (delay / 1000).toFixed(1);
      logger.warn(`  AI 重试 (${attempt}/${maxRetries}) [${delaySec}s 后]`);
      logger.debug(`  原因: ${error.message}`);
    },
  };

  let parsedResponse: ValidationResult;
  try {
    // Apply the system prompt before sending the analysis payload.
    await provider.createSession(request.systemPrompt, {
      thinkingLevel,
      timeout: config.ai?.timeout,
    });

    logger.section('发送完整分析数据至 AI...');
    const rawResponse = await withRetry(() => provider.sendMessage(request.payload), retryOptions);

    parsedResponse = parseResponse(rawResponse);
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
      meta: {
        rawError: raw,
      },
    };
  }
  const { data: result, warnings } = parsedResponse;

  if (warnings.length > 0) {
    logger.section('AI 响应警告:');
    for (const warning of warnings) {
      logger.warn(`  ${warning}`);
    }
  }

  try {
    writeDataFile(username, 'result', result);
  } catch (error) {
    const { message, raw } = extractErrorDetails(error);
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

  try {
    updateAnalysisState(username, (state) => {
      const latest = checkAnalyzedProvenance(state, analyzed, config.analyzer);
      if (
        latest.status !== 'valid' ||
        latest.analysisFingerprint !== provenance.analysisFingerprint ||
        latest.payloadHash !== provenance.payloadHash
      ) {
        throw new Error('analyzed provenance changed during AI delivery');
      }

      return recordProviderDelivery(state, {
        providerKey,
        analysisFingerprint: provenance.analysisFingerprint,
        payloadHash: provenance.payloadHash,
        basedOnPartial: provenance.basedOnPartial,
        deliveryMode: options.resend ? 'resend' : 'change',
      });
    });
  } catch (error) {
    const { message, raw } = extractErrorDetails(error);
    logger.error(`更新 AI provenance 状态失败: ${message}`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'PROVENANCE_UPDATE_FAILED',
      message: `result.json 已保存，但 provenance 状态更新失败: ${message}`,
      recoverable: true,
      recoverActions: getRecoveryActions('PROVENANCE_UPDATE_FAILED', { username }),
      meta: { rawError: raw },
    };
  }

  const cleaned = cleanExpiredData(username);

  if (!options.pipeline) {
    logger.success('分析结果已保存');
    if (cleaned.length > 0) {
      logger.detail(`已清理中间数据: ${cleaned.join(', ')}`);
    }
  }

  return {
    step: 'ai',
    status: 'success',
    message: 'AI 分析完成',
    meta: {
      model,
      warningCount: warnings.length,
      cleanedFiles: cleaned,
      deliveryMode: options.resend ? 'resend' : 'change',
    },
  };
}
