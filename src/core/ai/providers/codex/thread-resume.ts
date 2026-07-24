import type { CodexThreadInfo, CodexThreadSessionInfo } from '@/infra/codex';
import { areCodexProjectPathsEqual } from './project-path';
import type { CodexRuntimeConnection } from './runtime-selection';
import type { CodexThreadState } from './thread-state';

export type CodexThreadResumeErrorCode = 'thread_mismatch' | 'model_mismatch' | 'project_mismatch';

/** Reports App Server session metadata that differs from persisted recovery identity. */
export class CodexThreadResumeError extends Error {
  readonly code: CodexThreadResumeErrorCode;

  constructor(code: CodexThreadResumeErrorCode, message: string) {
    super(message);
    this.name = 'CodexThreadResumeError';
    this.code = code;
  }
}

export interface ResumeCodexThreadOptions {
  state: CodexThreadState;
  connection: Pick<CodexRuntimeConnection, 'resumeThread' | 'readThread'>;
  platform?: NodeJS.Platform;
}

export interface ResumedCodexThread {
  session: CodexThreadSessionInfo;
  thread: CodexThreadInfo;
}

function resumeError(code: CodexThreadResumeErrorCode, message: string): never {
  throw new CodexThreadResumeError(code, message);
}

function assertThreadId(actual: string, expected: string, source: string): void {
  if (actual !== expected) {
    resumeError(
      'thread_mismatch',
      `Codex ${source} thread "${actual}" does not match persisted thread "${expected}"`,
    );
  }
}

function assertProjectPath(
  actual: string,
  expected: string,
  source: string,
  platform: NodeJS.Platform,
): void {
  if (!areCodexProjectPathsEqual(actual, expected, platform)) {
    resumeError(
      'project_mismatch',
      `Codex ${source} Project "${actual}" does not match persisted Project "${expected}"`,
    );
  }
}

/**
 * Resumes and reads one persisted Codex thread with identity validation.
 * @param options - Persisted session identity, runtime connection, and path platform.
 * @returns The resumed session metadata and complete thread snapshot.
 * @throws {CodexThreadResumeError} When thread, model, or Project identity changed.
 */
export async function resumeCodexThread(
  options: ResumeCodexThreadOptions,
): Promise<ResumedCodexThread> {
  const platform = options.platform ?? process.platform;
  const session = await options.connection.resumeThread({
    threadId: options.state.threadId,
    model: options.state.model,
    cwd: options.state.projectPath,
  });
  assertThreadId(session.thread.id, options.state.threadId, 'resumed session');
  if (session.model !== options.state.model) {
    resumeError(
      'model_mismatch',
      `Codex resumed model "${session.model}" does not match persisted model "${options.state.model}"`,
    );
  }
  assertProjectPath(session.cwd, options.state.projectPath, 'session', platform);
  assertProjectPath(session.thread.cwd, options.state.projectPath, 'resumed thread', platform);

  const thread = await options.connection.readThread(options.state.threadId);
  assertThreadId(thread.id, options.state.threadId, 'read');
  assertProjectPath(thread.cwd, options.state.projectPath, 'read thread', platform);
  return { session, thread };
}
