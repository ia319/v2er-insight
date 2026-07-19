import { isCodexThreadRegistryV1 } from './thread-state-validator';
import {
  CODEX_THREAD_REGISTRY_SCHEMA_VERSION,
  CODEX_THREAD_STATE_SCHEMA_VERSION,
  type CodexThreadRegistryV1,
  type CodexThreadState,
} from './thread-state';

export type CodexThreadRegistryErrorCode = 'invalid_registry';

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
