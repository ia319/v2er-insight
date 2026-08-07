import { isResultVersionId } from '@/core/result-version/identifiers';
import { isCodexThreadState } from '../providers/codex/thread-state-validator';
import { isLocalSessionId } from './identifiers';
import type {
  AISessionIndexV1,
  AISessionProvider,
  AISessionStateV1,
  AISessionStatus,
  AISessionSummary,
  BaseAISessionState,
  CodexSessionStateV1,
  GeminiSessionStateV1,
  ProviderNeutralMessage,
} from './types';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isNormalizedNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.trim() === value;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isProvider(value: unknown): value is AISessionProvider {
  return value === 'gemini' || value === 'codex';
}

function isStatus(value: unknown): value is AISessionStatus {
  return value === 'promptPending' || value === 'analysisPending' || value === 'ready';
}

function hasValidAnalysisReference(value: Record<string, unknown>): boolean {
  const fields = [
    value.lastSuccessfulAnalysisAt,
    value.lastResultVersionId,
    value.lastAnalysisFingerprint,
  ];
  const nullCount = fields.filter((field) => field === null).length;
  if (nullCount === fields.length) return true;
  if (nullCount !== 0) return false;

  return (
    isTimestamp(value.lastSuccessfulAnalysisAt) &&
    isResultVersionId(value.lastResultVersionId) &&
    typeof value.lastAnalysisFingerprint === 'string' &&
    SHA256_PATTERN.test(value.lastAnalysisFingerprint) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.lastUsedAt) &&
    value.createdAt <= value.lastSuccessfulAnalysisAt &&
    value.lastSuccessfulAnalysisAt <= value.lastUsedAt
  );
}

function isBaseSessionState(value: unknown): value is BaseAISessionState {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isLocalSessionId(value.localSessionId) ||
    !isNormalizedNonBlankString(value.username) ||
    !isProvider(value.provider) ||
    typeof value.generation !== 'number' ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1 ||
    typeof value.promptHash !== 'string' ||
    !SHA256_PATTERN.test(value.promptHash) ||
    !isNormalizedNonBlankString(value.model) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.lastUsedAt) ||
    value.createdAt > value.lastUsedAt ||
    (value.lastSuccessfulAnalysisAt !== null && !isTimestamp(value.lastSuccessfulAnalysisAt)) ||
    (value.lastResultVersionId !== null && !isResultVersionId(value.lastResultVersionId)) ||
    (value.lastAnalysisFingerprint !== null &&
      (typeof value.lastAnalysisFingerprint !== 'string' ||
        !SHA256_PATTERN.test(value.lastAnalysisFingerprint)))
  ) {
    return false;
  }
  return hasValidAnalysisReference(value);
}

function isProviderNeutralMessage(value: unknown, expectedRole: 'user' | 'model'): boolean {
  if (!isRecord(value) || value.role !== expectedRole || !Array.isArray(value.parts)) return false;
  return (
    value.parts.length > 0 &&
    value.parts.every(
      (part) =>
        isRecord(part) &&
        hasOnlyKeys(part, ['text']) &&
        typeof part.text === 'string' &&
        part.text !== '',
    )
  );
}

function isProviderNeutralHistory(value: unknown): value is ProviderNeutralMessage[] {
  return (
    Array.isArray(value) &&
    value.length % 2 === 0 &&
    value.every((message, index) =>
      isProviderNeutralMessage(message, index % 2 === 0 ? 'user' : 'model'),
    )
  );
}

const BASE_SESSION_KEYS = [
  'schemaVersion',
  'localSessionId',
  'username',
  'provider',
  'generation',
  'promptHash',
  'model',
  'createdAt',
  'lastUsedAt',
  'lastSuccessfulAnalysisAt',
  'lastResultVersionId',
  'lastAnalysisFingerprint',
] as const;

/** Validates one persisted Gemini session and its complete paired text history. */
export function isGeminiSessionStateV1(value: unknown): value is GeminiSessionStateV1 {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [...BASE_SESSION_KEYS, 'systemInstruction', 'thinkingLevel', 'history']) &&
    isBaseSessionState(value) &&
    value.provider === 'gemini' &&
    isNormalizedNonBlankString(value.systemInstruction) &&
    (value.thinkingLevel === null || isNormalizedNonBlankString(value.thinkingLevel)) &&
    isProviderNeutralHistory(value.history)
  );
}

const CODEX_SESSION_KEYS = [
  ...BASE_SESSION_KEYS,
  'kind',
  'threadId',
  'displayName',
  'bootstrapStatus',
  'promptTurnId',
  'initialAnalysisTurnId',
  'lastTurnId',
  'pendingAnalysis',
  'lastReasoningEffort',
  'executablePath',
  'executableVersion',
  'projectPath',
  'instructionSources',
  'externalThreadId',
] as const;

/** Validates one persisted Codex session without duplicating its remote thread history. */
export function isCodexSessionStateV1(value: unknown): value is CodexSessionStateV1 {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, CODEX_SESSION_KEYS) &&
    isBaseSessionState(value) &&
    value.provider === 'codex' &&
    isCodexThreadState(value) &&
    isNormalizedNonBlankString(value.externalThreadId) &&
    value.externalThreadId === value.threadId
  );
}

/** Validates one provider-specific AI session file. */
export function isAISessionStateV1(value: unknown): value is AISessionStateV1 {
  return isGeminiSessionStateV1(value) || isCodexSessionStateV1(value);
}

function isSessionSummary(value: unknown): value is AISessionSummary {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'localSessionId',
      'provider',
      'generation',
      'status',
      'model',
      'promptHash',
      'createdAt',
      'lastUsedAt',
      'externalThreadId',
    ]) &&
    isLocalSessionId(value.localSessionId) &&
    isProvider(value.provider) &&
    typeof value.generation === 'number' &&
    Number.isSafeInteger(value.generation) &&
    value.generation > 0 &&
    isStatus(value.status) &&
    (value.provider === 'codex' || value.status === 'ready') &&
    isNormalizedNonBlankString(value.model) &&
    typeof value.promptHash === 'string' &&
    SHA256_PATTERN.test(value.promptHash) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.lastUsedAt) &&
    value.createdAt <= value.lastUsedAt &&
    (value.externalThreadId === null || isNormalizedNonBlankString(value.externalThreadId)) &&
    (value.provider === 'codex') === (value.externalThreadId !== null)
  );
}

function hasUniqueSummaries(summaries: readonly AISessionSummary[]): boolean {
  return (
    new Set(summaries.map((summary) => summary.localSessionId)).size === summaries.length &&
    new Set(summaries.map((summary) => `${summary.provider}:${summary.generation}`)).size ===
      summaries.length &&
    new Set(
      summaries.flatMap((summary) =>
        summary.externalThreadId === null ? [] : [summary.externalThreadId],
      ),
    ).size === summaries.filter((summary) => summary.externalThreadId !== null).length
  );
}

function hasValidActiveSessions(
  activeByProvider: Partial<Record<AISessionProvider, string>>,
  summaries: readonly AISessionSummary[],
): boolean {
  return (['gemini', 'codex'] as const).every((provider) => {
    const localSessionId = activeByProvider[provider];
    if (localSessionId === undefined) return true;
    return summaries.some(
      (summary) =>
        summary.provider === provider &&
        summary.localSessionId === localSessionId &&
        summary.status === 'ready',
    );
  });
}

/** Validates the per-user AI session index and its cross-session identities. */
export function isAISessionIndexV1(value: unknown): value is AISessionIndexV1 {
  const updatedAt = isRecord(value) ? value.updatedAt : undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'schemaVersion',
      'lastSuccessfulAnalysisProvider',
      'activeByProvider',
      'sessions',
      'migration',
      'updatedAt',
    ]) ||
    value.schemaVersion !== 1 ||
    (value.lastSuccessfulAnalysisProvider !== null &&
      !isProvider(value.lastSuccessfulAnalysisProvider)) ||
    !isRecord(value.activeByProvider) ||
    !hasOnlyKeys(value.activeByProvider, ['gemini', 'codex']) ||
    !Object.values(value.activeByProvider).every(isLocalSessionId) ||
    !Array.isArray(value.sessions) ||
    !value.sessions.every(isSessionSummary) ||
    !isTimestamp(updatedAt)
  ) {
    return false;
  }

  const summaries = value.sessions;
  if (
    !hasUniqueSummaries(summaries) ||
    !hasValidActiveSessions(value.activeByProvider, summaries)
  ) {
    return false;
  }
  if (
    value.lastSuccessfulAnalysisProvider !== null &&
    value.activeByProvider[value.lastSuccessfulAnalysisProvider] === undefined
  ) {
    return false;
  }
  if (summaries.some((summary) => summary.lastUsedAt > updatedAt)) return false;

  if (value.migration !== undefined) {
    if (
      !isRecord(value.migration) ||
      !hasOnlyKeys(value.migration, ['source', 'sourceHash', 'completedAt']) ||
      value.migration.source !== 'codex-sessions-v1' ||
      typeof value.migration.sourceHash !== 'string' ||
      !SHA256_PATTERN.test(value.migration.sourceHash) ||
      !isTimestamp(value.migration.completedAt) ||
      value.migration.completedAt > updatedAt
    ) {
      return false;
    }
  }
  return true;
}
