import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { CodexThreadSessionInfo } from '@/infra/codex';
import { areCodexProjectPathsEqual } from './project-path';
import { resolveNextCodexThreadIdentity } from './thread-naming';
import { createPendingCodexThreadState } from './thread-registry';
import type { CodexThreadRegistryV1, CodexThreadState } from './thread-state';
import type { CodexRuntimeConnection } from './runtime-selection';

export type CodexThreadCreationErrorCode =
  | 'local_session_id_invalid'
  | 'local_session_id_conflict'
  | 'thread_id_conflict'
  | 'model_mismatch'
  | 'project_mismatch'
  | 'persistence_mismatch';

/** Reports a local identity, App Server metadata, or persistence integrity failure. */
export class CodexThreadCreationError extends Error {
  readonly code: CodexThreadCreationErrorCode;

  constructor(code: CodexThreadCreationErrorCode, message: string) {
    super(message);
    this.name = 'CodexThreadCreationError';
    this.code = code;
  }
}

export interface CodexThreadCreationRuntime {
  executablePath: string;
  executableVersion: string;
  model: string;
  reasoningEffort: string;
  connection: Pick<CodexRuntimeConnection, 'startThread' | 'setThreadName'>;
}

export interface CreateCodexThreadGenerationOptions {
  username: string;
  registry: CodexThreadRegistryV1;
  runtime: CodexThreadCreationRuntime;
  projectPath: string;
  promptHash: string;
  persistPending: (
    state: CodexThreadState,
  ) => CodexThreadRegistryV1 | Promise<CodexThreadRegistryV1>;
  createLocalSessionId?: () => string;
  now?: () => Date;
  platform?: NodeJS.Platform;
}

export interface CreatedCodexThreadGeneration {
  registry: CodexThreadRegistryV1;
  state: CodexThreadState;
  session: CodexThreadSessionInfo;
}

function creationError(code: CodexThreadCreationErrorCode, message: string): never {
  throw new CodexThreadCreationError(code, message);
}

function assertLocalSessionId(registry: CodexThreadRegistryV1, localSessionId: string): void {
  if (localSessionId.trim() === '' || localSessionId.trim() !== localSessionId) {
    creationError('local_session_id_invalid', 'Codex local session ID is invalid');
  }
  if (registry.sessions.some((session) => session.localSessionId === localSessionId)) {
    creationError(
      'local_session_id_conflict',
      `Codex local session ID "${localSessionId}" already exists`,
    );
  }
}

function assertStartedSession(
  registry: CodexThreadRegistryV1,
  session: CodexThreadSessionInfo,
  runtime: CodexThreadCreationRuntime,
  projectPath: string,
  platform: NodeJS.Platform,
): void {
  if (registry.sessions.some((state) => state.threadId === session.thread.id)) {
    creationError('thread_id_conflict', `Codex thread ID "${session.thread.id}" already exists`);
  }
  if (session.model !== runtime.model) {
    creationError(
      'model_mismatch',
      `Codex thread model "${session.model}" does not match requested model "${runtime.model}"`,
    );
  }
  if (
    !areCodexProjectPathsEqual(session.cwd, projectPath, platform) ||
    !areCodexProjectPathsEqual(session.thread.cwd, projectPath, platform)
  ) {
    creationError(
      'project_mismatch',
      `Codex thread Projects "${session.cwd}" and "${session.thread.cwd}" do not match requested Project "${projectPath}"`,
    );
  }
}

function requirePersistedState(
  registry: CodexThreadRegistryV1,
  expected: CodexThreadState,
): CodexThreadState {
  const persisted = registry.sessions.find(
    (session) => session.localSessionId === expected.localSessionId,
  );
  if (!persisted || !isDeepStrictEqual(persisted, expected)) {
    return creationError(
      'persistence_mismatch',
      `Codex pending session "${expected.localSessionId}" was not persisted`,
    );
  }
  return persisted;
}

/**
 * Creates and records one recoverable Codex thread generation.
 * @param options - Validated runtime, registry, Project, prompt identity, and persistence boundary.
 * @returns The persisted pending state and App Server thread session.
 * @throws {CodexThreadCreationError} When identity, response metadata, or persistence is inconsistent.
 */
export async function createCodexThreadGeneration(
  options: CreateCodexThreadGenerationOptions,
): Promise<CreatedCodexThreadGeneration> {
  const localSessionId = (options.createLocalSessionId ?? randomUUID)();
  assertLocalSessionId(options.registry, localSessionId);
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  const identity = resolveNextCodexThreadIdentity(options.username, options.registry);
  const session = await options.runtime.connection.startThread({
    model: options.runtime.model,
    cwd: options.projectPath,
  });
  assertStartedSession(
    options.registry,
    session,
    options.runtime,
    options.projectPath,
    options.platform ?? process.platform,
  );

  const state = createPendingCodexThreadState({
    localSessionId,
    threadId: session.thread.id,
    generation: identity.generation,
    displayName: identity.displayName,
    promptHash: options.promptHash,
    model: session.model,
    reasoningEffort: options.runtime.reasoningEffort,
    executablePath: options.runtime.executablePath,
    executableVersion: options.runtime.executableVersion,
    projectPath: session.cwd,
    instructionSources: session.instructionSources,
    createdAt,
  });
  const registry = await options.persistPending(state);
  const persistedState = requirePersistedState(registry, state);

  await options.runtime.connection.setThreadName(session.thread.id, identity.displayName);
  return { registry, state: persistedState, session };
}
