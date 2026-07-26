import {
  GeminiProvider,
  isAIAnalysisResult,
  parseResponse,
  resolveApiKey,
  withRetry,
  type AIAnalysisResult,
  type AnalysisRequest,
  type ValidationResult,
} from '@/core/ai';
import {
  computeProviderStateKey,
  hasProviderReceivedAnalysis,
  type AnalysisState,
  type AnalyzedProvenanceCheck,
  type ProviderDeliveryRecordInput,
} from '@/core/provenance';
import { THINKING_LEVELS, type ResolvedGeminiConfig, type ThinkingLevel } from '@/config';
import { logger } from '@/infra/logger';

const GEMINI_LOGICAL_SESSION_KEY = 'default';
type ValidAnalyzedProvenance = Extract<AnalyzedProvenanceCheck, { status: 'valid' }>;

export interface ExecuteGeminiAnalysisOptions {
  username: string;
  config: ResolvedGeminiConfig;
  request: AnalysisRequest;
  analysisState: AnalysisState;
  provenance: ValidAnalyzedProvenance;
  savedResult: unknown;
  model?: string;
  thinkingLevel?: string;
  resend?: boolean;
}

interface GeminiCommandExecutionBase {
  model: string;
}

export type GeminiCommandExecution =
  | (GeminiCommandExecutionBase & { status: 'invalidThinkingLevel'; value: string })
  | (GeminiCommandExecutionBase & { status: 'apiKeyMissing' })
  | (GeminiCommandExecutionBase & { status: 'skipped'; providerKey: string })
  | (GeminiCommandExecutionBase & {
      status: 'result';
      providerKey: string;
      result: AIAnalysisResult;
      warnings: ValidationResult['warnings'];
      delivery: ProviderDeliveryRecordInput;
    });

function isThinkingLevel(value: string): value is ThinkingLevel {
  return THINKING_LEVELS.some((level) => level === value);
}

/**
 * Executes Gemini analysis and returns a delivery result for transactional persistence.
 * @param options - Resolved Gemini settings, current request, provenance, and CLI overrides.
 * @returns An option error, missing-key state, skip, or parsed provider result.
 * @throws When provider session creation, sending, retry, or response parsing fails.
 */
export async function executeGeminiAnalysis(
  options: ExecuteGeminiAnalysisOptions,
): Promise<GeminiCommandExecution> {
  const model = options.model ?? options.config.model;
  const thinkingLevel = options.thinkingLevel ?? options.config.thinkingLevel;
  if (!isThinkingLevel(thinkingLevel)) {
    return { status: 'invalidThinkingLevel', model, value: thinkingLevel };
  }

  logger.info(`\nAI 分析: ${options.username} (模型: ${model})`);
  logger.detail(`思考等级: ${thinkingLevel}`);

  const providerKey = computeProviderStateKey({
    provider: 'gemini',
    model,
    systemPrompt: options.request.systemPrompt,
    thinkingLevel,
    sessionKey: GEMINI_LOGICAL_SESSION_KEY,
  });
  const canReuseResult =
    options.resend !== true &&
    hasProviderReceivedAnalysis(
      options.analysisState,
      providerKey,
      options.provenance.analysisFingerprint,
    ) &&
    options.analysisState.currentResult?.analysisFingerprint ===
      options.provenance.analysisFingerprint &&
    !options.analysisState.currentResult.stale &&
    isAIAnalysisResult(options.savedResult);
  if (canReuseResult) return { status: 'skipped', model, providerKey };

  const apiKey = resolveApiKey();
  if (!apiKey) return { status: 'apiKeyMissing', model };

  const provider = new GeminiProvider(apiKey, model);
  const retryOptions = {
    maxRetries: options.config.maxRetries,
    baseDelay: options.config.baseDelay,
    maxDelay: options.config.maxDelay,
    onRetry: (attempt: number, maxRetries: number, error: Error, delay: number) => {
      const delaySec = (delay / 1000).toFixed(1);
      logger.warn(`  AI 重试 (${attempt}/${maxRetries}) [${delaySec}s 后]`);
      logger.debug(`  原因: ${error.message}`);
    },
  };

  await provider.createSession(options.request.systemPrompt, {
    thinkingLevel,
    timeout: options.config.timeout,
  });
  logger.section('发送完整分析数据至 AI...');
  const rawResponse = await withRetry(
    () => provider.sendMessage(options.request.payload),
    retryOptions,
  );
  const parsed = parseResponse(rawResponse);
  return {
    status: 'result',
    model,
    providerKey,
    result: parsed.data,
    warnings: parsed.warnings,
    delivery: {
      providerKey,
      analysisFingerprint: options.provenance.analysisFingerprint,
      payloadHash: options.provenance.payloadHash,
      basedOnPartial: options.provenance.basedOnPartial,
      deliveryMode: options.resend ? 'resend' : 'change',
    },
  };
}
