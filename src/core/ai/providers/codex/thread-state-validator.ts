import type {
  CodexBootstrapStatus,
  CodexPendingAnalysisDelivery,
  CodexThreadRegistryV1,
  CodexThreadState,
} from './thread-state';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isNullableNonBlankString(value: unknown): value is string | null {
  return value === null || isNonBlankString(value);
}

function isNormalizedNonBlankString(value: unknown): value is string {
  return isNonBlankString(value) && value.trim() === value;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isBootstrapStatus(value: unknown): value is CodexBootstrapStatus {
  return value === 'promptPending' || value === 'analysisPending' || value === 'ready';
}

function hasValidBootstrapTurns(
  status: CodexBootstrapStatus,
  promptTurnId: string | null,
  initialAnalysisTurnId: string | null,
  lastTurnId: string | null,
): boolean {
  switch (status) {
    case 'promptPending':
      return initialAnalysisTurnId === null && lastTurnId === promptTurnId;
    case 'analysisPending':
      return promptTurnId !== null && lastTurnId === (initialAnalysisTurnId ?? promptTurnId);
    case 'ready':
      return promptTurnId !== null && initialAnalysisTurnId !== null && lastTurnId !== null;
  }
}

function isInstructionSources(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonBlankString);
}

function isPendingAnalysisDelivery(value: unknown): value is CodexPendingAnalysisDelivery {
  return (
    isRecord(value) &&
    isNormalizedNonBlankString(value.deliveryId) &&
    isNormalizedNonBlankString(value.providerKey) &&
    typeof value.analysisFingerprint === 'string' &&
    SHA256_PATTERN.test(value.analysisFingerprint) &&
    typeof value.payloadHash === 'string' &&
    SHA256_PATTERN.test(value.payloadHash) &&
    typeof value.basedOnPartial === 'boolean' &&
    (value.deliveryMode === 'change' || value.deliveryMode === 'resend') &&
    isNormalizedNonBlankString(value.reasoningEffort) &&
    isNullableNonBlankString(value.turnId)
  );
}

function hasValidPendingAnalysis(
  status: CodexBootstrapStatus,
  initialAnalysisTurnId: string | null,
  lastTurnId: string | null,
  pending: CodexPendingAnalysisDelivery | undefined,
): boolean {
  if (pending === undefined) return true;
  if (status === 'promptPending') return false;
  if (pending.turnId === null) {
    return status === 'ready' || initialAnalysisTurnId === null;
  }
  return (
    lastTurnId === pending.turnId &&
    (status === 'ready' || initialAnalysisTurnId === pending.turnId)
  );
}

/** Validates one Codex thread state independently from its legacy registry container. */
export function isCodexThreadState(value: unknown): value is CodexThreadState {
  if (
    !isRecord(value) ||
    value.kind !== 'codex' ||
    value.schemaVersion !== 1 ||
    !isNonBlankString(value.localSessionId) ||
    !isNonBlankString(value.threadId) ||
    typeof value.generation !== 'number' ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1 ||
    !isNonBlankString(value.displayName) ||
    typeof value.promptHash !== 'string' ||
    !SHA256_PATTERN.test(value.promptHash) ||
    !isBootstrapStatus(value.bootstrapStatus) ||
    !isNullableNonBlankString(value.promptTurnId) ||
    !isNullableNonBlankString(value.initialAnalysisTurnId) ||
    !isNullableNonBlankString(value.lastTurnId) ||
    (value.pendingAnalysis !== undefined && !isPendingAnalysisDelivery(value.pendingAnalysis)) ||
    !isNonBlankString(value.model) ||
    !isNullableNonBlankString(value.lastReasoningEffort) ||
    !isNonBlankString(value.executablePath) ||
    !isNonBlankString(value.executableVersion) ||
    !isNonBlankString(value.projectPath) ||
    !isInstructionSources(value.instructionSources) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.lastUsedAt)
  ) {
    return false;
  }

  return (
    value.createdAt <= value.lastUsedAt &&
    hasValidBootstrapTurns(
      value.bootstrapStatus,
      value.promptTurnId,
      value.initialAnalysisTurnId,
      value.lastTurnId,
    ) &&
    hasValidPendingAnalysis(
      value.bootstrapStatus,
      value.initialAnalysisTurnId,
      value.lastTurnId,
      value.pendingAnalysis,
    )
  );
}

function hasUniqueSessionFields(sessions: readonly CodexThreadState[]): boolean {
  return (
    new Set(sessions.map((session) => session.localSessionId)).size === sessions.length &&
    new Set(sessions.map((session) => session.threadId)).size === sessions.length &&
    new Set(sessions.map((session) => session.generation)).size === sessions.length &&
    new Set(sessions.map((session) => session.displayName)).size === sessions.length
  );
}

function hasValidActiveSession(
  activeSessionId: string | null,
  sessions: readonly CodexThreadState[],
): boolean {
  const readySessions = sessions.filter((session) => session.bootstrapStatus === 'ready');
  if (activeSessionId === null) return readySessions.length === 0;
  return readySessions.some((session) => session.localSessionId === activeSessionId);
}

/** Validates parsed per-user Codex thread registry data and its cross-session invariants. */
export function isCodexThreadRegistryV1(value: unknown): value is CodexThreadRegistryV1 {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isNullableNonBlankString(value.activeSessionId)
  ) {
    return false;
  }

  const sessions = value.sessions;
  if (!Array.isArray(sessions) || !sessions.every(isCodexThreadState)) return false;
  return hasUniqueSessionFields(sessions) && hasValidActiveSession(value.activeSessionId, sessions);
}
