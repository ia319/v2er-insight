import type { CodexBootstrapStatus, CodexThreadRegistryV1, CodexThreadState } from './thread-state';

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
): boolean {
  switch (status) {
    case 'promptPending':
      return initialAnalysisTurnId === null;
    case 'analysisPending':
      return promptTurnId !== null;
    case 'ready':
      return promptTurnId !== null && initialAnalysisTurnId !== null;
  }
}

function isInstructionSources(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonBlankString);
}

function isCodexThreadState(value: unknown): value is CodexThreadState {
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
    hasValidBootstrapTurns(value.bootstrapStatus, value.promptTurnId, value.initialAnalysisTurnId)
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
