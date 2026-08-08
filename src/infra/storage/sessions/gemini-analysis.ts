import { isDeepStrictEqual } from 'node:util';
import { isLocalSessionId } from '@/core/ai/sessions/identifiers';
import { createAISessionSummary, sortAISessionSummaries } from '@/core/ai/sessions/summary';
import {
  AI_SESSION_STATE_SCHEMA_VERSION,
  type AISessionIndexV1,
  type GeminiSessionStateV1,
} from '@/core/ai/sessions/types';
import type { AIAnalysisResult } from '@/core/ai/types/result';
import { canonicalJsonStringify } from '@/core/provenance/canonical-json';
import type { ResultVersionMetadata } from '@/core/result-version/types';
import { AISessionPersistError, AISessionStoreCorruptError } from './errors';
import type { PreparedGeminiAnalysisSession } from './gemini-selection';
import {
  readAISessionIndex,
  readAISessionState,
  readAISessionStore,
  withAISessionIndexTransaction,
  writeAISessionIndex,
  writeAISessionState,
} from './repository';

export interface CompleteGeminiAnalysisSessionOptions {
  username: string;
  prepared: PreparedGeminiAnalysisSession;
  metadata: ResultVersionMetadata;
  requestPayload: string;
  result: AIAnalysisResult;
  thinkingLevel: string;
}

export interface RecoverGeminiAnalysisSessionOptions {
  username: string;
  metadata: ResultVersionMetadata;
  requestPayload: string;
  systemInstruction: string;
  result: AIAnalysisResult;
  thinkingLevel: string;
}

function maxTimestamp(...timestamps: string[]): string {
  return timestamps.reduce((latest, timestamp) => (timestamp > latest ? timestamp : latest));
}

function readStore(username: string): {
  index: AISessionIndexV1;
  sessions: GeminiSessionStateV1[];
} {
  const store = readAISessionStore(username);
  if (store.status !== 'valid') throw new AISessionStoreCorruptError();
  return {
    index: store.index,
    sessions: store.sessions.filter(
      (session): session is GeminiSessionStateV1 => session.provider === 'gemini',
    ),
  };
}

function readRecoverableStore(
  username: string,
  targetSessionId: string,
): {
  index: AISessionIndexV1;
  sessions: GeminiSessionStateV1[];
  target: GeminiSessionStateV1 | null;
} {
  const indexResult = readAISessionIndex(username);
  if (indexResult.status !== 'valid') throw new AISessionStoreCorruptError();

  const sessions: GeminiSessionStateV1[] = [];
  let target: GeminiSessionStateV1 | null = null;
  for (const summary of indexResult.index.sessions) {
    const state = readAISessionState(username, summary.provider, summary.localSessionId);
    if (state.status !== 'valid') throw new AISessionStoreCorruptError();
    const isTarget = summary.localSessionId === targetSessionId && summary.provider === 'gemini';
    if (!isTarget && !isDeepStrictEqual(createAISessionSummary(state.session), summary)) {
      throw new AISessionStoreCorruptError();
    }
    if (state.session.provider === 'gemini') {
      sessions.push(state.session);
      if (isTarget) target = state.session;
    }
  }

  if (target === null) {
    const direct = readAISessionState(username, 'gemini', targetSessionId);
    if (direct.status === 'invalid') throw new AISessionStoreCorruptError();
    if (direct.status === 'valid') {
      if (direct.session.provider !== 'gemini') throw new AISessionStoreCorruptError();
      target = direct.session;
    }
  }
  return { index: indexResult.index, sessions, target };
}

function assertCompletionIdentity(
  session: GeminiSessionStateV1,
  metadata: ResultVersionMetadata,
): void {
  if (
    metadata.provider !== 'gemini' ||
    metadata.localSessionId !== session.localSessionId ||
    metadata.externalThreadId !== null ||
    metadata.model !== session.model ||
    metadata.promptHash !== session.promptHash
  ) {
    throw new AISessionPersistError('Gemini result metadata does not match its local session');
  }
}

function hasLastHistoryPair(
  session: GeminiSessionStateV1,
  requestPayload: string,
  responseText: string,
): boolean {
  const user = session.history[session.history.length - 2];
  const model = session.history[session.history.length - 1];
  return (
    user?.role === 'user' &&
    user.parts.length === 1 &&
    user.parts[0]?.text === requestPayload &&
    model?.role === 'model' &&
    model.parts.length === 1 &&
    model.parts[0]?.text === responseText
  );
}

function createCompletedSession(
  session: GeminiSessionStateV1,
  metadata: ResultVersionMetadata,
  requestPayload: string,
  responseText: string,
  thinkingLevel: string,
): GeminiSessionStateV1 {
  assertCompletionIdentity(session, metadata);
  const successfulAt = metadata.createdAt ?? metadata.savedAt;
  if (session.lastResultVersionId === metadata.versionId) {
    if (
      session.lastSuccessfulAnalysisAt !== successfulAt ||
      session.lastAnalysisFingerprint !== metadata.analysisFingerprint ||
      !hasLastHistoryPair(session, requestPayload, responseText)
    ) {
      throw new AISessionPersistError('Gemini session result association is inconsistent');
    }
    return session;
  }

  return {
    ...session,
    thinkingLevel,
    lastUsedAt: maxTimestamp(session.lastUsedAt, successfulAt),
    lastSuccessfulAnalysisAt: successfulAt,
    lastResultVersionId: metadata.versionId,
    lastAnalysisFingerprint: metadata.analysisFingerprint,
    history: [
      ...session.history,
      { role: 'user', parts: [{ text: requestPayload }] },
      { role: 'model', parts: [{ text: responseText }] },
    ],
  };
}

function createCompletedIndex(
  index: AISessionIndexV1,
  session: GeminiSessionStateV1,
  now: string,
): AISessionIndexV1 {
  const otherSummaries = index.sessions.filter(
    (summary) => summary.localSessionId !== session.localSessionId,
  );
  const sessions = sortAISessionSummaries([...otherSummaries, createAISessionSummary(session)]);
  const activeByProvider = { ...index.activeByProvider, gemini: session.localSessionId };
  if (
    index.lastSuccessfulAnalysisProvider === 'gemini' &&
    isDeepStrictEqual(index.activeByProvider, activeByProvider) &&
    isDeepStrictEqual(index.sessions, sessions)
  ) {
    return index;
  }
  return {
    ...index,
    lastSuccessfulAnalysisProvider: 'gemini',
    activeByProvider,
    sessions,
    updatedAt: maxTimestamp(now, ...sessions.map((summary) => summary.lastUsedAt)),
  };
}

function persistCompletion(
  username: string,
  index: AISessionIndexV1,
  session: GeminiSessionStateV1,
  metadata: ResultVersionMetadata,
  requestPayload: string,
  result: AIAnalysisResult,
  thinkingLevel: string,
  now: () => Date,
): GeminiSessionStateV1 {
  const completed = createCompletedSession(
    session,
    metadata,
    requestPayload,
    canonicalJsonStringify(result),
    thinkingLevel,
  );
  const completedIndex = createCompletedIndex(index, completed, now().toISOString());
  if (!isDeepStrictEqual(completed, session)) writeAISessionState(username, completed);
  if (!isDeepStrictEqual(completedIndex, index)) writeAISessionIndex(username, completedIndex);
  return completed;
}

/**
 * Appends one successful Gemini analysis pair and publishes its active index projection.
 * @param options - Prepared session, committed result metadata, and successful turn contents.
 * @param now - Clock used for the index publication timestamp.
 * @returns The persisted Gemini session.
 * @throws When the prepared state changed or result identity is inconsistent.
 */
export function completeGeminiAnalysisSession(
  options: CompleteGeminiAnalysisSessionOptions,
  now: () => Date = () => new Date(),
): GeminiSessionStateV1 {
  return withAISessionIndexTransaction(options.username, () => {
    const current = readStore(options.username);
    const currentGeminiSummaries = current.index.sessions.filter(
      (summary) => summary.provider === 'gemini',
    );
    const preparedGeminiSummaries = options.prepared.index.sessions.filter(
      (summary) => summary.provider === 'gemini',
    );
    if (
      current.index.activeByProvider.gemini !== options.prepared.index.activeByProvider.gemini ||
      !isDeepStrictEqual(currentGeminiSummaries, preparedGeminiSummaries)
    ) {
      throw new AISessionPersistError('Gemini session index changed before result completion');
    }
    const persisted = current.sessions.find(
      (session) => session.localSessionId === options.prepared.session.localSessionId,
    );
    if (
      (!options.prepared.isNew && !isDeepStrictEqual(persisted, options.prepared.session)) ||
      (options.prepared.isNew && persisted !== undefined)
    ) {
      throw new AISessionPersistError('Gemini session changed before result completion');
    }

    return persistCompletion(
      options.username,
      current.index,
      options.prepared.session,
      options.metadata,
      options.requestPayload,
      options.result,
      options.thinkingLevel,
      now,
    );
  });
}

/**
 * Repairs Gemini session state after its immutable result version was already saved.
 * @param options - Saved result identity, current analysis request, and deterministic result text.
 * @param now - Clock used when publishing a repaired index.
 * @returns The recovered Gemini session.
 * @throws When indexed state is invalid or conflicts with the saved result identity.
 */
export function recoverGeminiAnalysisSession(
  options: RecoverGeminiAnalysisSessionOptions,
  now: () => Date = () => new Date(),
): GeminiSessionStateV1 {
  const localSessionId = options.metadata.localSessionId;
  if (
    options.metadata.provider !== 'gemini' ||
    !localSessionId ||
    !isLocalSessionId(localSessionId) ||
    !options.metadata.model ||
    !options.metadata.promptHash
  ) {
    throw new AISessionPersistError('Saved Gemini result does not identify its local session');
  }
  const model = options.metadata.model;
  const promptHash = options.metadata.promptHash;
  return withAISessionIndexTransaction(options.username, () => {
    const current = readRecoverableStore(options.username, localSessionId);
    const existingSession = current.target ?? undefined;

    const timestamp = now().toISOString();
    const session: GeminiSessionStateV1 = existingSession
      ? existingSession
      : {
          schemaVersion: AI_SESSION_STATE_SCHEMA_VERSION,
          localSessionId,
          username: options.username,
          provider: 'gemini',
          generation:
            current.sessions.reduce(
              (maximum, candidate) => Math.max(maximum, candidate.generation),
              0,
            ) + 1,
          promptHash,
          model,
          createdAt: options.metadata.createdAt ?? timestamp,
          lastUsedAt: options.metadata.createdAt ?? timestamp,
          lastSuccessfulAnalysisAt: null,
          lastResultVersionId: null,
          lastAnalysisFingerprint: null,
          systemInstruction: options.systemInstruction,
          thinkingLevel: options.thinkingLevel,
          history: [],
        };

    return persistCompletion(
      options.username,
      current.index,
      session,
      options.metadata,
      options.requestPayload,
      options.result,
      options.thinkingLevel,
      now,
    );
  });
}
