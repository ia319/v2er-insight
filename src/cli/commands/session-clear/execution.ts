import { getConfig, resolveCodexConfig } from '@/config';
import { selectCodexControlRuntime } from '@/core/ai/providers/codex';
import { discoverCodexExecutables } from '@/infra/codex';
import { logger } from '@/infra/logger';
import { deleteAISession, withAISessionLock } from '@/infra/storage';
import type { ResolvedSessionClearScope, SessionClearPreviewTarget } from './scope';

/** Reports that the selected App Server cannot delete persisted threads. */
export class SessionDeleteUnsupportedError extends Error {
  constructor(message = 'The selected Codex CLI does not support thread/delete') {
    super(message);
    this.name = 'SessionDeleteUnsupportedError';
  }
}

/** Reports a failed external Codex thread deletion. */
export class SessionDeleteFailedError extends Error {
  constructor(threadId: string, failure: unknown) {
    const message = failure instanceof Error ? failure.message : String(failure);
    super(`Codex thread "${threadId}" could not be deleted: ${message}`);
    this.name = 'SessionDeleteFailedError';
  }
}

/** Preserves completed deletions and any external-only deletion after a later failure. */
export class SessionClearExecutionError extends Error {
  readonly deleted: number;
  readonly failure: unknown;

  constructor(deleted: number, failure: unknown, externallyDeletedThreadId?: string) {
    const message = failure instanceof Error ? failure.message : String(failure);
    super(
      externallyDeletedThreadId
        ? `Codex thread "${externallyDeletedThreadId}" was deleted, but its local session mapping could not be removed: ${message}`
        : message,
    );
    this.name = 'SessionClearExecutionError';
    this.deleted = deleted;
    this.failure = failure;
  }
}

function isMethodNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'CodexAppServerRpcError' &&
    'code' in error &&
    error.code === -32601
  );
}

/**
 * Acquires every confirmed provider-session lock in preview order.
 * @param username - Owner of the selected sessions.
 * @param targets - Canonically ordered identities presented for confirmation.
 * @param operation - Destructive work to run after every target is locked.
 * @returns The operation result after all locks are released.
 */
export async function withSessionClearLocks<T>(
  username: string,
  targets: readonly SessionClearPreviewTarget[],
  operation: () => Promise<T>,
  index = 0,
): Promise<T> {
  const target = targets[index];
  if (!target) return operation();
  return withAISessionLock(username, target.provider, target.localSessionId, () =>
    withSessionClearLocks(username, targets, operation, index + 1),
  );
}

/**
 * Deletes provider-owned state and then removes each matching local session mapping.
 * @param username - Owner of the confirmed sessions.
 * @param scope - Locked index snapshot and exact sessions selected for deletion.
 * @returns The number of sessions fully removed from external and local state.
 * @throws {SessionClearExecutionError} When a later target fails after zero or more deletions.
 */
export async function clearConfirmedSessionScope(
  username: string,
  scope: ResolvedSessionClearScope,
): Promise<number> {
  const codexSessions = scope.sessions.filter((session) => session.provider === 'codex');
  const orderedSessions = [
    ...codexSessions,
    ...scope.sessions.filter((session) => session.provider === 'gemini'),
  ];
  let controlRuntime: Awaited<ReturnType<typeof selectCodexControlRuntime>> | undefined;
  let deleteCodexThread: ((threadId: string) => Promise<void>) | undefined;
  const firstCodexSession = codexSessions[0];
  if (firstCodexSession) {
    const config = getConfig();
    const codex = resolveCodexConfig(config.ai);
    const discovery = discoverCodexExecutables(
      codex.executable ? { explicitPath: codex.executable } : {},
    );
    try {
      controlRuntime = await selectCodexControlRuntime(discovery.launchCandidates, {
        versionTimeoutMs: codex.startupTimeout,
        process: {
          requestTimeoutMs: codex.startupTimeout,
          shutdownGraceMs: codex.shutdownGrace,
          ...(config.proxy ? { proxyUrl: config.proxy } : {}),
        },
        connection: { startupTimeoutMs: codex.startupTimeout },
      });
    } catch (error) {
      throw new SessionClearExecutionError(
        0,
        new SessionDeleteFailedError(firstCodexSession.externalThreadId, error),
      );
    }
    deleteCodexThread = controlRuntime.connection.deleteThread.bind(controlRuntime.connection);
  }

  let currentIndex = scope.index;
  let deleted = 0;
  try {
    for (const session of orderedSessions) {
      let externallyDeletedThreadId: string | undefined;
      if (session.provider === 'codex') {
        try {
          if (!deleteCodexThread) throw new SessionDeleteUnsupportedError();
          await deleteCodexThread(session.externalThreadId);
          externallyDeletedThreadId = session.externalThreadId;
        } catch (error) {
          const failure = isMethodNotFound(error)
            ? new SessionDeleteUnsupportedError()
            : new SessionDeleteFailedError(session.externalThreadId, error);
          throw new SessionClearExecutionError(deleted, failure);
        }
      }
      try {
        currentIndex = deleteAISession(username, currentIndex, session);
      } catch (error) {
        throw new SessionClearExecutionError(deleted, error, externallyDeletedThreadId);
      }
      deleted += 1;
    }
  } finally {
    await controlRuntime?.connection.close().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.diagnostic('warn', `Codex control runtime 关闭失败: ${message}`);
    });
  }
  return deleted;
}
