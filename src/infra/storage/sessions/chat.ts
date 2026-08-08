import { isDeepStrictEqual } from 'node:util';
import { createAISessionSummary, sortAISessionSummaries } from '@/core/ai/sessions/summary';
import type {
  AISessionIndexV1,
  AISessionProvider,
  AISessionStateV1,
  CodexSessionStateV1,
  GeminiSessionStateV1,
} from '@/core/ai/sessions/types';
import { AISessionPersistError, AISessionStoreCorruptError } from './errors';
import { readAISessionStore, writeAISessionIndex, writeAISessionState } from './repository';

export type ChatSessionSelection =
  | { provider: 'gemini'; index: AISessionIndexV1; session: GeminiSessionStateV1 }
  | { provider: 'codex'; index: AISessionIndexV1; session: CodexSessionStateV1 };

/** Reports that no ready session matches the requested chat provider. */
export class ChatSessionMissingError extends Error {
  readonly provider: AISessionProvider | null;

  constructor(provider: AISessionProvider | null) {
    super(provider ? `No ready ${provider} session is available` : 'No chat session is available');
    this.name = 'ChatSessionMissingError';
    this.provider = provider;
  }
}

function maxTimestamp(...timestamps: string[]): string {
  return timestamps.reduce((latest, timestamp) => (timestamp > latest ? timestamp : latest));
}

/** Resolves a ready chat session without consulting the global provider configuration. */
export function selectChatSession(
  username: string,
  requestedProvider?: AISessionProvider,
): ChatSessionSelection {
  const store = readAISessionStore(username);
  if (store.status === 'missing') throw new ChatSessionMissingError(requestedProvider ?? null);
  if (store.status === 'invalid') throw new AISessionStoreCorruptError();

  const provider = requestedProvider ?? store.index.lastSuccessfulAnalysisProvider;
  if (provider === null) throw new ChatSessionMissingError(null);
  const localSessionId = store.index.activeByProvider[provider];
  if (!localSessionId) throw new ChatSessionMissingError(provider);

  const session = store.sessions.find(
    (candidate) => candidate.provider === provider && candidate.localSessionId === localSessionId,
  );
  if (!session) throw new AISessionStoreCorruptError();
  if (session.provider === 'codex') {
    if (session.bootstrapStatus !== 'ready') throw new ChatSessionMissingError(provider);
    return { provider: 'codex', index: store.index, session };
  }
  return { provider: 'gemini', index: store.index, session };
}

function publishSessionUpdate(
  username: string,
  expectedIndex: AISessionIndexV1,
  expectedSession: AISessionStateV1,
  updatedSession: AISessionStateV1,
  usedAt: string,
): void {
  const current = readAISessionStore(username);
  if (current.status !== 'valid' || !isDeepStrictEqual(current.index, expectedIndex)) {
    throw new AISessionPersistError('AI session index changed during the chat turn');
  }
  const currentSession = current.sessions.find(
    (candidate) => candidate.localSessionId === expectedSession.localSessionId,
  );
  if (!isDeepStrictEqual(currentSession, expectedSession)) {
    throw new AISessionPersistError('AI session changed during the chat turn');
  }

  const summaries = sortAISessionSummaries([
    ...expectedIndex.sessions.filter(
      (summary) => summary.localSessionId !== updatedSession.localSessionId,
    ),
    createAISessionSummary(updatedSession),
  ]);
  const updatedIndex: AISessionIndexV1 = {
    ...expectedIndex,
    sessions: summaries,
    updatedAt: maxTimestamp(
      expectedIndex.updatedAt,
      usedAt,
      ...summaries.map((summary) => summary.lastUsedAt),
    ),
  };
  try {
    writeAISessionState(username, updatedSession);
  } catch (error) {
    throw new AISessionPersistError(`AI chat history could not be written: ${String(error)}`);
  }
  try {
    writeAISessionIndex(username, updatedIndex);
  } catch (error) {
    try {
      writeAISessionState(username, expectedSession);
    } catch (rollbackError) {
      throw new AISessionPersistError(
        `AI session index publication and session rollback both failed: ${String(rollbackError)}`,
      );
    }
    throw new AISessionPersistError(`AI session index could not be published: ${String(error)}`);
  }
}

/** Appends one successful Gemini user/model pair and leaves provider selection unchanged. */
export function completeGeminiChatSession(
  username: string,
  selection: Extract<ChatSessionSelection, { provider: 'gemini' }>,
  userText: string,
  modelText: string,
  now: () => Date = () => new Date(),
): GeminiSessionStateV1 {
  if (userText === '' || modelText === '') {
    throw new TypeError('Gemini chat history entries must not be empty');
  }
  const usedAt = now().toISOString();
  const session: GeminiSessionStateV1 = {
    ...selection.session,
    lastUsedAt: maxTimestamp(selection.session.lastUsedAt, usedAt),
    history: [
      ...selection.session.history,
      { role: 'user', parts: [{ text: userText }] },
      { role: 'model', parts: [{ text: modelText }] },
    ],
  };
  publishSessionUpdate(username, selection.index, selection.session, session, usedAt);
  return session;
}
