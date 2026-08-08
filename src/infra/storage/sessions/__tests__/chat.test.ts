import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAISessionSummary } from '@/core/ai/sessions/summary';
import type { AISessionIndexV1, GeminiSessionStateV1 } from '@/core/ai/sessions/types';

const mockedReadAISessionStore = vi.hoisted(() => vi.fn());
const mockedWriteAISessionState = vi.hoisted(() => vi.fn());
const mockedWriteAISessionIndex = vi.hoisted(() => vi.fn());

vi.mock('../repository', () => ({
  readAISessionStore: mockedReadAISessionStore,
  withAISessionIndexTransaction: (_username: string, operation: () => unknown) => operation(),
  writeAISessionState: mockedWriteAISessionState,
  writeAISessionIndex: mockedWriteAISessionIndex,
}));

import { ChatSessionMissingError, completeGeminiChatSession, selectChatSession } from '../chat';
import { AISessionPersistError, AISessionStoreCorruptError } from '../errors';

const HASH = 'a'.repeat(64);
const SESSION_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb810';

function createSession(): GeminiSessionStateV1 {
  return {
    schemaVersion: 1,
    localSessionId: SESSION_ID,
    username: 'alice',
    provider: 'gemini',
    generation: 1,
    promptHash: HASH,
    model: 'gemini-current',
    createdAt: '2026-08-02T01:00:00.000Z',
    lastUsedAt: '2026-08-02T01:00:00.000Z',
    lastSuccessfulAnalysisAt: '2026-08-02T01:00:00.000Z',
    lastResultVersionId: '20260802T010000000Z-aaaaaaaaaaaa',
    lastAnalysisFingerprint: HASH,
    systemInstruction: 'Analyze.',
    thinkingLevel: 'high',
    history: [
      { role: 'user', parts: [{ text: 'analysis' }] },
      { role: 'model', parts: [{ text: 'profile' }] },
    ],
  };
}

function createIndex(session: GeminiSessionStateV1): AISessionIndexV1 {
  return {
    schemaVersion: 1,
    lastSuccessfulAnalysisProvider: 'gemini',
    activeByProvider: { gemini: session.localSessionId },
    sessions: [createAISessionSummary(session)],
    updatedAt: session.lastUsedAt,
  };
}

describe('chat session storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the last successful analysis provider unless one is explicit', () => {
    const session = createSession();
    const index = createIndex(session);
    mockedReadAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });

    expect(selectChatSession('alice')).toEqual({ provider: 'gemini', index, session });
  });

  it('does not fall back when the requested provider has no ready session', () => {
    const session = createSession();
    const index = createIndex(session);
    mockedReadAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });

    expect(() => selectChatSession('alice', 'codex')).toThrow(ChatSessionMissingError);
    expect(() => selectChatSession('alice', 'codex')).toThrow('No ready codex session');
  });

  it('distinguishes a missing store from a corrupt store', () => {
    mockedReadAISessionStore.mockReturnValueOnce({ status: 'missing' });
    expect(() => selectChatSession('alice')).toThrow(ChatSessionMissingError);

    mockedReadAISessionStore.mockReturnValueOnce({ status: 'invalid' });
    expect(() => selectChatSession('alice')).toThrow(AISessionStoreCorruptError);
  });

  it('appends only a complete successful pair and preserves provider selection', () => {
    const session = createSession();
    const index = createIndex(session);
    mockedReadAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });
    const selection = selectChatSession('alice');
    if (selection.provider !== 'gemini') throw new Error('Expected Gemini selection');

    const completed = completeGeminiChatSession(
      'alice',
      selection,
      'question',
      'answer',
      () => new Date('2026-08-02T02:00:00.000Z'),
    );

    expect(completed.history.slice(-2)).toEqual([
      { role: 'user', parts: [{ text: 'question' }] },
      { role: 'model', parts: [{ text: 'answer' }] },
    ]);
    expect(mockedWriteAISessionState).toHaveBeenCalledWith('alice', completed);
    expect(mockedWriteAISessionIndex).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({
        lastSuccessfulAnalysisProvider: 'gemini',
        activeByProvider: { gemini: SESSION_ID },
        updatedAt: '2026-08-02T02:00:00.000Z',
      }),
    );
  });

  it('refuses to publish after the selected snapshot changes', () => {
    const session = createSession();
    const index = createIndex(session);
    mockedReadAISessionStore
      .mockReturnValueOnce({ status: 'valid', index, sessions: [session] })
      .mockReturnValueOnce({
        status: 'valid',
        index: {
          ...index,
          activeByProvider: { gemini: '6d8eea46-7e52-47ca-a740-34a0b01bb811' },
        },
        sessions: [session],
      });
    const selection = selectChatSession('alice');
    if (selection.provider !== 'gemini') throw new Error('Expected Gemini selection');

    expect(() => completeGeminiChatSession('alice', selection, 'question', 'answer')).toThrow(
      AISessionPersistError,
    );
    expect(mockedWriteAISessionState).not.toHaveBeenCalled();
  });

  it('merges an unrelated Codex index update during the Gemini turn', () => {
    const session = createSession();
    const index = createIndex(session);
    const codexSessionId = '6d8eea46-7e52-47ca-a740-34a0b01bb812';
    const codexSummary = {
      localSessionId: codexSessionId,
      provider: 'codex' as const,
      generation: 1,
      status: 'ready' as const,
      model: 'gpt-current',
      promptHash: 'b'.repeat(64),
      createdAt: '2026-08-02T01:30:00.000Z',
      lastUsedAt: '2026-08-02T01:30:00.000Z',
      externalThreadId: 'thread-1',
    };
    mockedReadAISessionStore
      .mockReturnValueOnce({ status: 'valid', index, sessions: [session] })
      .mockReturnValueOnce({
        status: 'valid',
        index: {
          ...index,
          lastSuccessfulAnalysisProvider: 'codex',
          activeByProvider: { ...index.activeByProvider, codex: codexSessionId },
          sessions: [codexSummary, ...index.sessions],
          updatedAt: codexSummary.lastUsedAt,
        },
        sessions: [session],
      });
    const selection = selectChatSession('alice');
    if (selection.provider !== 'gemini') throw new Error('Expected Gemini selection');

    completeGeminiChatSession('alice', selection, 'question', 'answer');

    expect(mockedWriteAISessionIndex).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({
        lastSuccessfulAnalysisProvider: 'codex',
        activeByProvider: { gemini: SESSION_ID, codex: codexSessionId },
        sessions: expect.arrayContaining([codexSummary]),
      }),
    );
  });

  it('restores the previous history when index publication fails', () => {
    const session = createSession();
    const index = createIndex(session);
    mockedReadAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });
    mockedWriteAISessionIndex.mockImplementation(() => {
      throw new Error('index write failed');
    });
    const selection = selectChatSession('alice');
    if (selection.provider !== 'gemini') throw new Error('Expected Gemini selection');

    expect(() => completeGeminiChatSession('alice', selection, 'question', 'answer')).toThrow(
      'AI session index could not be published',
    );
    expect(mockedWriteAISessionState).toHaveBeenCalledTimes(2);
    expect(mockedWriteAISessionState).toHaveBeenLastCalledWith('alice', session);
  });
});
