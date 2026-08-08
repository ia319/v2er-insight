import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAISessionSummary } from '@/core/ai/sessions';
import type { CodexSessionStateV1 } from '@/core/ai/sessions';
import type { ResultVersionMetadata } from '@/core/result-version';

const mocks = vi.hoisted(() => ({
  assertCodexSessionMigrationIdentity: vi.fn(),
  readAISessionIndex: vi.fn(),
  readAISessionState: vi.fn(),
  withAISessionIndexTransaction: vi.fn((_username: string, operation: () => unknown) =>
    operation(),
  ),
  writeAISessionIndex: vi.fn(),
  writeAISessionState: vi.fn(),
}));

vi.mock('../codex-registry', () => ({
  assertCodexSessionMigrationIdentity: mocks.assertCodexSessionMigrationIdentity,
}));

vi.mock('../repository', () => ({
  readAISessionIndex: mocks.readAISessionIndex,
  readAISessionState: mocks.readAISessionState,
  withAISessionIndexTransaction: mocks.withAISessionIndexTransaction,
  writeAISessionIndex: mocks.writeAISessionIndex,
  writeAISessionState: mocks.writeAISessionState,
}));

import { AISessionPersistError } from '../errors';
import { recoverCodexAnalysisSession } from '../codex-analysis';

const HASH = 'a'.repeat(64);
const PAYLOAD_HASH = 'b'.repeat(64);
const RESULT_HASH = 'c'.repeat(64);
const SESSION_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb810';
const DELIVERY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = new Date('2026-08-02T03:00:00.000Z');

function createSession(): CodexSessionStateV1 {
  return {
    kind: 'codex',
    schemaVersion: 1,
    localSessionId: SESSION_ID,
    threadId: 'thread-1',
    generation: 1,
    displayName: 'alice-insight',
    promptHash: HASH,
    bootstrapStatus: 'ready',
    promptTurnId: 'prompt-turn',
    initialAnalysisTurnId: 'analysis-turn',
    lastTurnId: 'analysis-turn',
    model: 'gpt-current',
    lastReasoningEffort: 'high',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.146.0',
    projectPath: 'D:\\data',
    instructionSources: [],
    createdAt: '2026-08-02T01:00:00.000Z',
    lastUsedAt: '2026-08-02T02:00:00.000Z',
    username: 'alice',
    provider: 'codex',
    externalThreadId: 'thread-1',
    lastSuccessfulAnalysisAt: null,
    lastResultVersionId: null,
    lastAnalysisFingerprint: null,
  };
}

function createMetadata(): ResultVersionMetadata {
  return {
    versionId: 'v000002',
    sequence: 2,
    origin: 'analysis',
    deliveryId: DELIVERY_ID,
    previousLatestVersionId: 'v000001',
    previousCurrentHash: RESULT_HASH,
    createdAt: '2026-08-02T02:30:00.000Z',
    savedAt: '2026-08-02T02:31:00.000Z',
    provider: 'codex',
    model: 'gpt-current',
    reasoningLevel: 'high',
    localSessionId: SESSION_ID,
    externalThreadId: 'thread-1',
    threadName: 'alice-insight',
    promptHash: HASH,
    analysisFingerprint: HASH,
    payloadHash: PAYLOAD_HASH,
    resultHash: RESULT_HASH,
    dataQuality: 'complete',
    warningCount: 0,
    appVersion: '0.0.0',
  };
}

function mockStore(session: CodexSessionStateV1, indexed = session): void {
  mocks.readAISessionIndex.mockReturnValue({
    status: 'valid',
    index: {
      schemaVersion: 1,
      lastSuccessfulAnalysisProvider: 'codex',
      activeByProvider: { codex: SESSION_ID },
      sessions: [createAISessionSummary(indexed)],
      updatedAt: indexed.lastUsedAt,
    },
  });
  mocks.readAISessionState.mockReturnValue({ status: 'valid', session });
}

describe('Codex analysis session result association', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore(createSession());
  });

  it('writes the completed Codex state before publishing its index projection', () => {
    const metadata = createMetadata();
    const indexed = createSession();
    const completedTurn = {
      ...indexed,
      lastUsedAt: '2026-08-02T02:15:00.000Z',
    };
    mockStore(completedTurn, indexed);

    const result = recoverCodexAnalysisSession({ username: 'alice', metadata }, () => NOW);

    expect(result).toMatchObject({
      status: 'completed',
      session: {
        lastSuccessfulAnalysisAt: metadata.createdAt,
        lastResultVersionId: metadata.versionId,
        lastAnalysisFingerprint: metadata.analysisFingerprint,
        lastUsedAt: metadata.createdAt,
      },
    });
    expect(mocks.writeAISessionState.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeAISessionIndex.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.writeAISessionIndex).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({
        lastSuccessfulAnalysisProvider: 'codex',
        activeByProvider: { codex: SESSION_ID },
        sessions: [expect.objectContaining({ lastUsedAt: metadata.createdAt })],
      }),
    );
  });

  it('republishes an index after the provider state was already associated', () => {
    const metadata = createMetadata();
    const indexed = createSession();
    const associated: CodexSessionStateV1 = {
      ...indexed,
      lastUsedAt: metadata.createdAt!,
      lastSuccessfulAnalysisAt: metadata.createdAt,
      lastResultVersionId: metadata.versionId,
      lastAnalysisFingerprint: metadata.analysisFingerprint,
    };
    mockStore(associated, indexed);

    expect(recoverCodexAnalysisSession({ username: 'alice', metadata }, () => NOW)).toMatchObject({
      status: 'completed',
      session: associated,
    });
    expect(mocks.writeAISessionState).not.toHaveBeenCalled();
    expect(mocks.writeAISessionIndex).toHaveBeenCalledOnce();
  });

  it('leaves a matching accepted turn pending for provider recovery', () => {
    const metadata = createMetadata();
    const session: CodexSessionStateV1 = {
      ...createSession(),
      pendingAnalysis: {
        deliveryId: DELIVERY_ID,
        providerKey: `codex:${HASH}`,
        analysisFingerprint: HASH,
        payloadHash: PAYLOAD_HASH,
        basedOnPartial: false,
        deliveryMode: 'change',
        reasoningEffort: 'high',
        turnId: 'analysis-turn',
      },
    };
    mockStore(session);

    expect(recoverCodexAnalysisSession({ username: 'alice', metadata })).toMatchObject({
      status: 'pending',
      session,
    });
    expect(mocks.writeAISessionState).not.toHaveBeenCalled();
    expect(mocks.writeAISessionIndex).not.toHaveBeenCalled();
  });

  it('rejects result metadata for another Codex thread', () => {
    const metadata = { ...createMetadata(), externalThreadId: 'thread-2' };

    expect(() => recoverCodexAnalysisSession({ username: 'alice', metadata })).toThrow(
      AISessionPersistError,
    );
    expect(mocks.writeAISessionState).not.toHaveBeenCalled();
    expect(mocks.writeAISessionIndex).not.toHaveBeenCalled();
  });
});
