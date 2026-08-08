import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs';
import type { AISessionIndexV1, AISessionStateV1 } from '@/core/ai/sessions/types';
import { sortAISessionSummaries } from '@/core/ai/sessions/summary';
import { AISessionPersistError, AISessionStoreCorruptError } from './errors';
import { getAISessionFilePath } from './paths';
import { readAISessionStore, writeAISessionIndex } from './repository';

function maxTimestamp(...timestamps: string[]): string {
  return timestamps.reduce((latest, timestamp) => (timestamp > latest ? timestamp : latest));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createIndexWithoutSession(
  index: AISessionIndexV1,
  session: AISessionStateV1,
  now: string,
): AISessionIndexV1 {
  const activeByProvider = { ...index.activeByProvider };
  if (activeByProvider[session.provider] === session.localSessionId) {
    delete activeByProvider[session.provider];
  }
  const lastSuccessfulAnalysisProvider =
    index.lastSuccessfulAnalysisProvider === session.provider &&
    activeByProvider[session.provider] === undefined
      ? null
      : index.lastSuccessfulAnalysisProvider;
  const sessions = sortAISessionSummaries(
    index.sessions.filter((summary) => summary.localSessionId !== session.localSessionId),
  );
  return {
    ...index,
    lastSuccessfulAnalysisProvider,
    activeByProvider,
    sessions,
    updatedAt: maxTimestamp(
      index.updatedAt,
      now,
      ...sessions.map((summary) => summary.lastUsedAt),
      ...(index.migration ? [index.migration.completedAt] : []),
    ),
  };
}

/**
 * Removes one selected provider session while retaining the empty index and migration marker.
 * @param username - Owner of the provider session.
 * @param expectedIndex - Index snapshot used when the destructive scope was confirmed.
 * @param expectedSession - Exact session selected for deletion.
 * @param now - Clock used for the retained index update.
 * @returns The retained index after the session mapping and file are removed.
 * @throws {AISessionStoreCorruptError} When the current store cannot be validated.
 * @throws {AISessionPersistError} When the confirmed scope changed or deletion cannot be persisted.
 */
export function deleteAISession(
  username: string,
  expectedIndex: AISessionIndexV1,
  expectedSession: AISessionStateV1,
  now: () => Date = () => new Date(),
): AISessionIndexV1 {
  const current = readAISessionStore(username);
  if (current.status !== 'valid') throw new AISessionStoreCorruptError();
  const session = current.sessions.find(
    (candidate) => candidate.localSessionId === expectedSession.localSessionId,
  );
  if (
    !isDeepStrictEqual(current.index, expectedIndex) ||
    !isDeepStrictEqual(session, expectedSession)
  ) {
    throw new AISessionPersistError('AI session clear scope changed after confirmation');
  }

  const updatedIndex = createIndexWithoutSession(
    current.index,
    expectedSession,
    now().toISOString(),
  );
  writeAISessionIndex(username, updatedIndex);
  try {
    fs.unlinkSync(
      getAISessionFilePath(username, expectedSession.provider, expectedSession.localSessionId),
    );
  } catch (error) {
    try {
      writeAISessionIndex(username, current.index);
    } catch (rollbackError) {
      throw new AISessionPersistError(
        `AI session file deletion failed (${getErrorMessage(error)}) and index rollback failed (${getErrorMessage(rollbackError)})`,
      );
    }
    throw new AISessionPersistError(`AI session file deletion failed: ${getErrorMessage(error)}`);
  }
  return updatedIndex;
}
