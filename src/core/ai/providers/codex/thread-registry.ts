import { isCodexThreadRegistryV1 } from './thread-state-validator';
import {
  CODEX_THREAD_REGISTRY_SCHEMA_VERSION,
  CODEX_THREAD_STATE_SCHEMA_VERSION,
  type CodexThreadRegistryV1,
  type CodexThreadState,
} from './thread-state';

export type CodexThreadRegistryErrorCode =
  | 'invalid_registry'
  | 'session_not_found'
  | 'invalid_transition';

export class CodexThreadRegistryError extends Error {
  readonly code: CodexThreadRegistryErrorCode;

  constructor(code: CodexThreadRegistryErrorCode, message: string) {
    super(message);
    this.name = 'CodexThreadRegistryError';
    this.code = code;
  }
}

export interface CreatePendingCodexThreadInput {
  localSessionId: string;
  threadId: string;
  generation: number;
  displayName: string;
  promptHash: string;
  model: string;
  reasoningEffort: string;
  executablePath: string;
  executableVersion: string;
  projectPath: string;
  instructionSources: readonly string[];
  createdAt: string;
}

function assertValidRegistry(registry: CodexThreadRegistryV1): CodexThreadRegistryV1 {
  if (!isCodexThreadRegistryV1(registry)) {
    throw new CodexThreadRegistryError(
      'invalid_registry',
      'Codex thread registry transition produced invalid state',
    );
  }
  return registry;
}

function invalidTransition(message: string): never {
  throw new CodexThreadRegistryError('invalid_transition', message);
}

function updateSession(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  update: (session: CodexThreadState) => CodexThreadState,
  activeSessionId = registry.activeSessionId,
): CodexThreadRegistryV1 {
  const current = registry.sessions.find((session) => session.localSessionId === localSessionId);
  if (!current) {
    throw new CodexThreadRegistryError(
      'session_not_found',
      `Codex local session "${localSessionId}" was not found`,
    );
  }

  const nextSession = update(current);
  const sessions = registry.sessions.map((session) =>
    session.localSessionId === localSessionId ? nextSession : session,
  );
  return assertValidRegistry({ ...registry, activeSessionId, sessions });
}

function assertUsageTime(session: CodexThreadState, usedAt: string): void {
  if (usedAt < session.lastUsedAt) {
    invalidTransition('Codex session usage time cannot move backwards');
  }
}

function requireStatus(
  session: CodexThreadState,
  status: CodexThreadState['bootstrapStatus'],
): void {
  if (session.bootstrapStatus !== status) {
    invalidTransition(
      `Codex session "${session.localSessionId}" must be ${status} for this transition`,
    );
  }
}

/** Creates a prompt-pending local record from one persisted App Server thread. */
export function createPendingCodexThreadState(
  input: CreatePendingCodexThreadInput,
): CodexThreadState {
  const state: CodexThreadState = {
    kind: 'codex',
    schemaVersion: CODEX_THREAD_STATE_SCHEMA_VERSION,
    localSessionId: input.localSessionId,
    threadId: input.threadId,
    generation: input.generation,
    displayName: input.displayName,
    promptHash: input.promptHash,
    bootstrapStatus: 'promptPending',
    promptTurnId: null,
    initialAnalysisTurnId: null,
    lastTurnId: null,
    model: input.model,
    lastReasoningEffort: input.reasoningEffort,
    executablePath: input.executablePath,
    executableVersion: input.executableVersion,
    projectPath: input.projectPath,
    instructionSources: [...input.instructionSources],
    createdAt: input.createdAt,
    lastUsedAt: input.createdAt,
  };

  assertValidRegistry({
    schemaVersion: CODEX_THREAD_REGISTRY_SCHEMA_VERSION,
    activeSessionId: null,
    sessions: [state],
  });
  return state;
}

/** Appends a pending session while preserving the current active ready session. */
export function appendPendingCodexThreadState(
  registry: CodexThreadRegistryV1,
  state: CodexThreadState,
): CodexThreadRegistryV1 {
  if (state.bootstrapStatus !== 'promptPending') {
    throw new CodexThreadRegistryError(
      'invalid_registry',
      'Only a prompt-pending Codex session can be appended',
    );
  }
  return assertValidRegistry({ ...registry, sessions: [...registry.sessions, state] });
}

/** Records the accepted prompt turn before waiting for its completion. */
export function recordCodexPromptTurn(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  turnId: string,
  usedAt: string,
): CodexThreadRegistryV1 {
  return updateSession(registry, localSessionId, (session) => {
    requireStatus(session, 'promptPending');
    assertUsageTime(session, usedAt);
    if (session.promptTurnId !== null && session.promptTurnId !== turnId) {
      return invalidTransition('Codex prompt turn ID is already assigned');
    }
    return { ...session, promptTurnId: turnId, lastTurnId: turnId, lastUsedAt: usedAt };
  });
}

/** Advances a completed prompt turn to the analysis-pending stage. */
export function completeCodexPromptTurn(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  turnId: string,
  usedAt: string,
): CodexThreadRegistryV1 {
  return updateSession(registry, localSessionId, (session) => {
    requireStatus(session, 'promptPending');
    assertUsageTime(session, usedAt);
    if (session.promptTurnId !== turnId || session.lastTurnId !== turnId) {
      return invalidTransition('Codex prompt completion does not match the recorded turn');
    }
    return { ...session, bootstrapStatus: 'analysisPending', lastUsedAt: usedAt };
  });
}

/** Records the accepted initial analysis turn before waiting for its completion. */
export function recordCodexInitialAnalysisTurn(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  turnId: string,
  usedAt: string,
): CodexThreadRegistryV1 {
  return updateSession(registry, localSessionId, (session) => {
    requireStatus(session, 'analysisPending');
    assertUsageTime(session, usedAt);
    if (session.initialAnalysisTurnId !== null && session.initialAnalysisTurnId !== turnId) {
      return invalidTransition('Codex initial analysis turn ID is already assigned');
    }
    return {
      ...session,
      initialAnalysisTurnId: turnId,
      lastTurnId: turnId,
      lastUsedAt: usedAt,
    };
  });
}

/** Marks the initial analysis successful and switches the active session. */
export function activateCodexThreadSession(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  turnId: string,
  reasoningEffort: string,
  usedAt: string,
): CodexThreadRegistryV1 {
  return updateSession(
    registry,
    localSessionId,
    (session) => {
      requireStatus(session, 'analysisPending');
      assertUsageTime(session, usedAt);
      if (session.initialAnalysisTurnId !== turnId || session.lastTurnId !== turnId) {
        return invalidTransition('Codex analysis completion does not match the recorded turn');
      }
      return {
        ...session,
        bootstrapStatus: 'ready',
        lastReasoningEffort: reasoningEffort,
        lastUsedAt: usedAt,
      };
    },
    localSessionId,
  );
}

/** Records an accepted turn on a ready session. */
export function recordCodexThreadTurnStart(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  turnId: string,
  usedAt: string,
): CodexThreadRegistryV1 {
  return updateSession(registry, localSessionId, (session) => {
    requireStatus(session, 'ready');
    assertUsageTime(session, usedAt);
    return { ...session, lastTurnId: turnId, lastUsedAt: usedAt };
  });
}

/** Records successful completion metadata for the latest ready-session turn. */
export function completeCodexThreadTurn(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  turnId: string,
  reasoningEffort: string,
  usedAt: string,
): CodexThreadRegistryV1 {
  return updateSession(registry, localSessionId, (session) => {
    requireStatus(session, 'ready');
    assertUsageTime(session, usedAt);
    if (session.lastTurnId !== turnId) {
      return invalidTransition('Codex turn completion does not match the latest accepted turn');
    }
    return { ...session, lastReasoningEffort: reasoningEffort, lastUsedAt: usedAt };
  });
}
