import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAIAnalysisResultFixture } from '@/core/ai/__tests__/result-fixture';
import { createAISessionSummary } from '@/core/ai/sessions/summary';
import type { AISessionIndexV1, GeminiSessionStateV1 } from '@/core/ai/sessions/types';
import { canonicalJsonStringify, hashCanonicalJson } from '@/core/provenance/canonical-json';
import type { ResultVersionMetadata } from '@/core/result-version/types';

const mocks = vi.hoisted(() => ({
  readAISessionIndex: vi.fn(),
  readAISessionState: vi.fn(),
  readAISessionStore: vi.fn(),
  withAISessionIndexTransaction: vi.fn((_username: string, operation: () => unknown) =>
    operation(),
  ),
  writeAISessionIndex: vi.fn(),
  writeAISessionState: vi.fn(),
}));

vi.mock('../repository', () => ({
  readAISessionIndex: mocks.readAISessionIndex,
  readAISessionState: mocks.readAISessionState,
  readAISessionStore: mocks.readAISessionStore,
  withAISessionIndexTransaction: mocks.withAISessionIndexTransaction,
  writeAISessionIndex: mocks.writeAISessionIndex,
  writeAISessionState: mocks.writeAISessionState,
}));

import { AISessionPersistError } from '../errors';
import { completeGeminiAnalysisSession, recoverGeminiAnalysisSession } from '../gemini-analysis';

const SESSION_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb810';
const NEW_SESSION_ID = 'a68b8b25-30c2-4aef-a238-76fe197b5d43';
const PROMPT_HASH = 'a'.repeat(64);
const ANALYSIS_HASH = 'b'.repeat(64);
const PAYLOAD_HASH = 'c'.repeat(64);
const REQUEST_PAYLOAD = '{"schemaVersion":2}';
const NOW = new Date('2026-08-02T05:00:00.000Z');
const RESULT = createAIAnalysisResultFixture();

function createSession(overrides: Partial<GeminiSessionStateV1> = {}): GeminiSessionStateV1 {
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
    lastAnalysisFingerprint: 'd'.repeat(64),
    systemInstruction: 'Analyze safely.',
    thinkingLevel: 'high',
    history: [
      { role: 'user', parts: [{ text: '{"old":true}' }] },
      { role: 'model', parts: [{ text: '{"summary":"old"}' }] },
    ],
    ...overrides,
  };
}

function createIndex(session = createSession()): AISessionIndexV1 {
  return {
    schemaVersion: 1,
    lastSuccessfulAnalysisProvider: 'gemini',
    activeByProvider: { gemini: session.localSessionId },
    sessions: [createAISessionSummary(session)],
    updatedAt: session.lastUsedAt,
  };
}

function createMetadata(localSessionId = SESSION_ID): ResultVersionMetadata {
  return {
    versionId: 'v000002',
    sequence: 2,
    origin: 'analysis',
    deliveryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    previousLatestVersionId: 'v000001',
    previousCurrentHash: 'e'.repeat(64),
    createdAt: '2026-08-02T04:30:00.000Z',
    savedAt: '2026-08-02T04:31:00.000Z',
    provider: 'gemini',
    model: 'gemini-current',
    reasoningLevel: 'high',
    localSessionId,
    externalThreadId: null,
    threadName: null,
    promptHash: PROMPT_HASH,
    analysisFingerprint: ANALYSIS_HASH,
    payloadHash: PAYLOAD_HASH,
    resultHash: hashCanonicalJson(RESULT),
    dataQuality: 'complete',
    warningCount: 0,
    appVersion: '1.2.0',
  };
}

describe('Gemini analysis session storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAISessionState.mockReturnValue({ status: 'missing' });
  });

  it('writes the complete history pair before publishing the active index', () => {
    const session = createSession();
    const index = createIndex(session);
    const prepared = { index, session, isNew: false };
    mocks.readAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });

    const completed = completeGeminiAnalysisSession(
      {
        username: 'alice',
        prepared,
        metadata: createMetadata(),
        requestPayload: REQUEST_PAYLOAD,
        result: RESULT,
        thinkingLevel: 'medium',
      },
      () => NOW,
    );

    expect(completed).toMatchObject({
      lastResultVersionId: 'v000002',
      lastAnalysisFingerprint: ANALYSIS_HASH,
      thinkingLevel: 'medium',
    });
    expect(completed.history.slice(-2)).toEqual([
      { role: 'user', parts: [{ text: REQUEST_PAYLOAD }] },
      { role: 'model', parts: [{ text: canonicalJsonStringify(RESULT) }] },
    ]);
    expect(mocks.writeAISessionState.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeAISessionIndex.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.writeAISessionIndex.mock.calls[0]?.[1]).toMatchObject({
      lastSuccessfulAnalysisProvider: 'gemini',
      activeByProvider: { gemini: SESSION_ID },
    });
  });

  it('rejects a changed Gemini index before writing a prepared result', () => {
    const session = createSession();
    const index = createIndex(session);
    mocks.readAISessionStore.mockReturnValue({
      status: 'valid',
      index: {
        ...index,
        activeByProvider: { gemini: NEW_SESSION_ID },
      },
      sessions: [session],
    });

    expect(() =>
      completeGeminiAnalysisSession({
        username: 'alice',
        prepared: { index, session, isNew: false },
        metadata: createMetadata(),
        requestPayload: REQUEST_PAYLOAD,
        result: RESULT,
        thinkingLevel: 'high',
      }),
    ).toThrow(AISessionPersistError);
    expect(mocks.writeAISessionState).not.toHaveBeenCalled();
  });

  it('preserves an unrelated Codex index update during Gemini completion', () => {
    const session = createSession();
    const index = createIndex(session);
    const codexSessionId = '6d8eea46-7e52-47ca-a740-34a0b01bb812';
    const codexSummary = {
      localSessionId: codexSessionId,
      provider: 'codex' as const,
      generation: 1,
      status: 'ready' as const,
      model: 'gpt-current',
      promptHash: 'f'.repeat(64),
      createdAt: '2026-08-02T03:00:00.000Z',
      lastUsedAt: '2026-08-02T03:00:00.000Z',
      externalThreadId: 'thread-1',
    };
    mocks.readAISessionStore.mockReturnValue({
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

    completeGeminiAnalysisSession({
      username: 'alice',
      prepared: { index, session, isNew: false },
      metadata: createMetadata(),
      requestPayload: REQUEST_PAYLOAD,
      result: RESULT,
      thinkingLevel: 'high',
    });

    expect(mocks.writeAISessionIndex).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({
        activeByProvider: { gemini: SESSION_ID, codex: codexSessionId },
        sessions: expect.arrayContaining([codexSummary]),
      }),
    );
  });

  it('reconstructs a missing new generation from committed result metadata', () => {
    const oldSession = createSession();
    const index = createIndex(oldSession);
    mocks.readAISessionIndex.mockReturnValue({ status: 'valid', index });
    mocks.readAISessionState.mockImplementation(
      (_username: string, _provider: string, localSessionId: string) =>
        localSessionId === SESSION_ID
          ? { status: 'valid', session: oldSession }
          : { status: 'missing' },
    );

    const recovered = recoverGeminiAnalysisSession(
      {
        username: 'alice',
        metadata: createMetadata(NEW_SESSION_ID),
        requestPayload: REQUEST_PAYLOAD,
        systemInstruction: 'Analyze safely.',
        result: RESULT,
        thinkingLevel: 'high',
      },
      () => NOW,
    );

    expect(recovered).toMatchObject({
      localSessionId: NEW_SESSION_ID,
      generation: 2,
      lastResultVersionId: 'v000002',
    });
    expect(mocks.writeAISessionIndex.mock.calls[0]?.[1]).toMatchObject({
      activeByProvider: { gemini: NEW_SESSION_ID },
      sessions: [{ localSessionId: SESSION_ID }, { localSessionId: NEW_SESSION_ID }],
    });
  });

  it('publishes an unindexed completed file without duplicating its history', () => {
    const oldSession = createSession();
    const index = createIndex(oldSession);
    const metadata = createMetadata(NEW_SESSION_ID);
    const completed = createSession({
      localSessionId: NEW_SESSION_ID,
      generation: 2,
      createdAt: metadata.createdAt!,
      lastUsedAt: metadata.createdAt!,
      lastSuccessfulAnalysisAt: metadata.createdAt,
      lastResultVersionId: metadata.versionId,
      lastAnalysisFingerprint: metadata.analysisFingerprint,
      history: [
        { role: 'user', parts: [{ text: REQUEST_PAYLOAD }] },
        { role: 'model', parts: [{ text: canonicalJsonStringify(RESULT) }] },
      ],
    });
    mocks.readAISessionIndex.mockReturnValue({ status: 'valid', index });
    mocks.readAISessionState.mockImplementation(
      (_username: string, _provider: string, localSessionId: string) => ({
        status: 'valid',
        session: localSessionId === SESSION_ID ? oldSession : completed,
      }),
    );

    const recovered = recoverGeminiAnalysisSession({
      username: 'alice',
      metadata,
      requestPayload: REQUEST_PAYLOAD,
      systemInstruction: completed.systemInstruction,
      result: RESULT,
      thinkingLevel: 'high',
    });

    expect(recovered.history).toHaveLength(2);
    expect(mocks.writeAISessionState).not.toHaveBeenCalled();
    expect(mocks.writeAISessionIndex).toHaveBeenCalledOnce();
  });

  it('repairs an index left behind its completed provider file', () => {
    const oldSession = createSession();
    const index = createIndex(oldSession);
    const metadata = createMetadata();
    const completed = createSession({
      lastUsedAt: metadata.createdAt!,
      lastSuccessfulAnalysisAt: metadata.createdAt,
      lastResultVersionId: metadata.versionId,
      lastAnalysisFingerprint: metadata.analysisFingerprint,
      history: [
        ...oldSession.history,
        { role: 'user', parts: [{ text: REQUEST_PAYLOAD }] },
        { role: 'model', parts: [{ text: canonicalJsonStringify(RESULT) }] },
      ],
    });
    mocks.readAISessionIndex.mockReturnValue({ status: 'valid', index });
    mocks.readAISessionState.mockReturnValue({ status: 'valid', session: completed });

    const recovered = recoverGeminiAnalysisSession({
      username: 'alice',
      metadata,
      requestPayload: REQUEST_PAYLOAD,
      systemInstruction: completed.systemInstruction,
      result: RESULT,
      thinkingLevel: 'high',
    });

    expect(recovered.history).toHaveLength(oldSession.history.length + 2);
    expect(mocks.writeAISessionState).not.toHaveBeenCalled();
    expect(mocks.writeAISessionIndex).toHaveBeenCalledOnce();
  });

  it.each([
    { field: 'model', metadataOverride: { model: 'gemini-other' } },
    { field: 'prompt hash', metadataOverride: { promptHash: 'e'.repeat(64) } },
    { field: 'external thread', metadataOverride: { externalThreadId: 'thread-1' } },
  ] as const)('rejects recovered metadata with a mismatched $field', ({ metadataOverride }) => {
    const session = createSession();
    const index = createIndex(session);
    mocks.readAISessionIndex.mockReturnValue({ status: 'valid', index });
    mocks.readAISessionState.mockReturnValue({ status: 'valid', session });

    expect(() =>
      recoverGeminiAnalysisSession({
        username: 'alice',
        metadata: { ...createMetadata(), ...metadataOverride },
        requestPayload: REQUEST_PAYLOAD,
        systemInstruction: session.systemInstruction,
        result: RESULT,
        thinkingLevel: 'high',
      }),
    ).toThrow(AISessionPersistError);
    expect(mocks.writeAISessionState).not.toHaveBeenCalled();
    expect(mocks.writeAISessionIndex).not.toHaveBeenCalled();
  });

  it('rejects an inconsistent repeated result association', () => {
    const metadata = createMetadata();
    const session = createSession({
      lastUsedAt: metadata.createdAt!,
      lastSuccessfulAnalysisAt: metadata.createdAt,
      lastResultVersionId: metadata.versionId,
      lastAnalysisFingerprint: 'e'.repeat(64),
      history: [
        { role: 'user', parts: [{ text: REQUEST_PAYLOAD }] },
        { role: 'model', parts: [{ text: canonicalJsonStringify(RESULT) }] },
      ],
    });
    const index = createIndex(session);
    mocks.readAISessionIndex.mockReturnValue({ status: 'valid', index });
    mocks.readAISessionState.mockReturnValue({ status: 'valid', session });

    expect(() =>
      recoverGeminiAnalysisSession({
        username: 'alice',
        metadata,
        requestPayload: REQUEST_PAYLOAD,
        systemInstruction: session.systemInstruction,
        result: RESULT,
        thinkingLevel: 'high',
      }),
    ).toThrow(AISessionPersistError);
    expect(mocks.writeAISessionState).not.toHaveBeenCalled();
    expect(mocks.writeAISessionIndex).not.toHaveBeenCalled();
  });
});
