import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAISessionSummary } from '@/core/ai/sessions/summary';
import type { AISessionIndexV1, GeminiSessionStateV1 } from '@/core/ai/sessions/types';

const mocks = vi.hoisted(() => ({ readAISessionStore: vi.fn() }));

vi.mock('../repository', () => ({ readAISessionStore: mocks.readAISessionStore }));

import { AISessionStoreCorruptError } from '../errors';
import { prepareGeminiAnalysisSession } from '../gemini-selection';

const SESSION_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb810';
const NEW_SESSION_ID = 'a68b8b25-30c2-4aef-a238-76fe197b5d43';
const PROMPT_HASH = 'a'.repeat(64);
const NOW = new Date('2026-08-02T05:00:00.000Z');

function createSession(): GeminiSessionStateV1 {
  return {
    schemaVersion: 1,
    localSessionId: SESSION_ID,
    username: 'alice',
    provider: 'gemini',
    generation: 1,
    promptHash: PROMPT_HASH,
    model: 'gemini-current',
    createdAt: '2026-08-02T01:00:00.000Z',
    lastUsedAt: '2026-08-02T02:00:00.000Z',
    lastSuccessfulAnalysisAt: '2026-08-02T02:00:00.000Z',
    lastResultVersionId: 'v000001',
    lastAnalysisFingerprint: 'b'.repeat(64),
    systemInstruction: 'Analyze safely.',
    thinkingLevel: 'high',
    history: [
      { role: 'user', parts: [{ text: '{"old":true}' }] },
      { role: 'model', parts: [{ text: '{"summary":"old"}' }] },
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

describe('Gemini analysis session selection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reuses a compatible active session when only thinking level changes', () => {
    const session = createSession();
    const index = createIndex(session);
    mocks.readAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });

    expect(
      prepareGeminiAnalysisSession({
        username: 'alice',
        model: session.model,
        promptHash: session.promptHash,
        systemInstruction: session.systemInstruction,
        thinkingLevel: 'medium',
      }),
    ).toEqual({ index, session, isNew: false });
  });

  it('creates the next generation for an explicit new-session request', () => {
    const session = createSession();
    const index = createIndex(session);
    mocks.readAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });

    const next = prepareGeminiAnalysisSession(
      {
        username: 'alice',
        model: session.model,
        promptHash: session.promptHash,
        systemInstruction: session.systemInstruction,
        thinkingLevel: 'high',
        forceNew: true,
      },
      () => NOW,
      () => NEW_SESSION_ID,
    );

    expect(next).toMatchObject({
      isNew: true,
      session: { localSessionId: NEW_SESSION_ID, generation: 2, history: [] },
    });
  });

  it.each([
    { field: 'model', override: { model: 'gemini-next' } },
    { field: 'prompt hash', override: { promptHash: 'b'.repeat(64) } },
    { field: 'system instruction', override: { systemInstruction: 'Analyze cautiously.' } },
  ] as const)('creates the next generation when the $field changes', ({ override }) => {
    const session = createSession();
    const index = createIndex(session);
    mocks.readAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });

    const next = prepareGeminiAnalysisSession(
      {
        username: 'alice',
        model: session.model,
        promptHash: session.promptHash,
        systemInstruction: session.systemInstruction,
        thinkingLevel: 'high',
        ...override,
      },
      () => NOW,
      () => NEW_SESSION_ID,
    );

    expect(next).toMatchObject({
      index,
      isNew: true,
      session: {
        localSessionId: NEW_SESSION_ID,
        generation: 2,
        history: [],
        ...override,
      },
    });
  });

  it('rejects a missing or invalid shared session store', () => {
    mocks.readAISessionStore.mockReturnValue({ status: 'missing' });

    expect(() =>
      prepareGeminiAnalysisSession({
        username: 'alice',
        model: 'gemini-current',
        promptHash: PROMPT_HASH,
        systemInstruction: 'Analyze safely.',
        thinkingLevel: 'high',
      }),
    ).toThrow(AISessionStoreCorruptError);
  });
});
