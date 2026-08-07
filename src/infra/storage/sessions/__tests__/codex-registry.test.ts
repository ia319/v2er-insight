import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodexThreadRegistryV1 } from '@/core/ai/providers/codex/thread-state';
import type { AISessionIndexV1, CodexSessionStateV1 } from '@/core/ai/sessions/types';

const mocks = vi.hoisted(() => ({
  readAISessionState: vi.fn(),
  readAISessionStore: vi.fn(),
  writeAISessionIndex: vi.fn(),
  writeAISessionState: vi.fn(),
  readAnalysisState: vi.fn(),
  readCodexThreadRegistry: vi.fn(),
  readStoredResultVersion: vi.fn(),
}));

vi.mock('../repository', () => ({
  readAISessionState: mocks.readAISessionState,
  readAISessionStore: mocks.readAISessionStore,
  writeAISessionIndex: mocks.writeAISessionIndex,
  writeAISessionState: mocks.writeAISessionState,
}));
vi.mock('../../analysis-state', () => ({ readAnalysisState: mocks.readAnalysisState }));
vi.mock('../../codex-thread-registry', () => ({
  CodexThreadRegistryCorruptError: class extends Error {},
  readCodexThreadRegistry: mocks.readCodexThreadRegistry,
}));
vi.mock('../../result-version-files', () => ({
  readStoredResultVersion: mocks.readStoredResultVersion,
}));

import {
  AISessionMigrationConflictError,
  AISessionMigrationFailedError,
  ensureCodexSessionRegistry,
  inspectCodexSessionStorage,
  updateCodexSessionRegistry,
} from '../codex-registry';

const HASH = 'a'.repeat(64);
const SESSION_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb810';
const NOW = new Date('2026-08-02T03:00:00.000Z');

function createLegacyRegistry(): CodexThreadRegistryV1 {
  return {
    schemaVersion: 1,
    activeSessionId: SESSION_ID,
    sessions: [
      {
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
      },
    ],
  };
}

function createPersistedStore(): {
  index: AISessionIndexV1;
  session: CodexSessionStateV1;
} {
  const legacy = createLegacyRegistry();
  const thread = legacy.sessions[0];
  if (!thread) throw new Error('Missing fixture session');
  const session: CodexSessionStateV1 = {
    ...thread,
    username: 'alice',
    provider: 'codex',
    externalThreadId: thread.threadId,
    lastSuccessfulAnalysisAt: null,
    lastResultVersionId: null,
    lastAnalysisFingerprint: null,
  };
  return {
    session,
    index: {
      schemaVersion: 1,
      lastSuccessfulAnalysisProvider: 'codex',
      activeByProvider: { codex: SESSION_ID },
      sessions: [
        {
          localSessionId: SESSION_ID,
          provider: 'codex',
          generation: 1,
          status: 'ready',
          model: thread.model,
          promptHash: HASH,
          createdAt: thread.createdAt,
          lastUsedAt: thread.lastUsedAt,
          externalThreadId: thread.threadId,
        },
      ],
      updatedAt: thread.lastUsedAt,
    },
  };
}

describe('Codex provider session storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readAnalysisState.mockReturnValue({ status: 'missing' });
    mocks.readStoredResultVersion.mockReturnValue({ status: 'missing' });
    mocks.readAISessionState.mockReturnValue({ status: 'missing' });
    mocks.readCodexThreadRegistry.mockReturnValue({ status: 'missing' });
  });

  it('inspects a pending legacy migration without writing either store', () => {
    const registry = createLegacyRegistry();
    mocks.readAISessionStore.mockReturnValue({ status: 'missing' });
    mocks.readCodexThreadRegistry.mockReturnValue({ status: 'valid', registry });

    expect(inspectCodexSessionStorage('alice')).toEqual({
      sessions: 'missing',
      legacy: 'valid',
      migration: 'pending',
      registry: { status: 'valid', registry },
    });
    expect(mocks.writeAISessionState).not.toHaveBeenCalled();
    expect(mocks.writeAISessionIndex).not.toHaveBeenCalled();
  });

  it('reports an unmarked new and legacy store as a conflict', () => {
    const registry = createLegacyRegistry();
    const { index, session } = createPersistedStore();
    mocks.readAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });
    mocks.readCodexThreadRegistry.mockReturnValue({ status: 'valid', registry });

    expect(inspectCodexSessionStorage('alice')).toEqual({
      sessions: 'valid',
      legacy: 'valid',
      migration: 'conflict',
      registry: { status: 'invalid' },
    });
  });

  it('creates an empty index when no legacy registry exists', () => {
    mocks.readAISessionStore.mockReturnValue({ status: 'missing' });
    mocks.readCodexThreadRegistry.mockReturnValue({ status: 'missing' });

    expect(ensureCodexSessionRegistry('alice', () => NOW)).toEqual({
      schemaVersion: 1,
      activeSessionId: null,
      sessions: [],
    });
    expect(mocks.writeAISessionIndex).toHaveBeenCalledWith('alice', {
      schemaVersion: 1,
      lastSuccessfulAnalysisProvider: null,
      activeByProvider: {},
      sessions: [],
      updatedAt: NOW.toISOString(),
    });
  });

  it('migrates every legacy Codex session before publishing the index', () => {
    const registry = createLegacyRegistry();
    mocks.readAISessionStore.mockReturnValue({ status: 'missing' });
    mocks.readCodexThreadRegistry.mockReturnValue({ status: 'valid', registry });

    expect(ensureCodexSessionRegistry('alice', () => NOW)).toEqual(registry);
    const migrated = mocks.writeAISessionState.mock.calls[0]?.[1] as CodexSessionStateV1;
    expect(migrated).toMatchObject({
      localSessionId: SESSION_ID,
      username: 'alice',
      provider: 'codex',
      externalThreadId: 'thread-1',
      lastResultVersionId: null,
    });
    expect(mocks.writeAISessionState.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeAISessionIndex.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.writeAISessionIndex.mock.calls[0]?.[1]).toMatchObject({
      lastSuccessfulAnalysisProvider: 'codex',
      activeByProvider: { codex: SESSION_ID },
      migration: { source: 'codex-sessions-v1', completedAt: NOW.toISOString() },
    });
  });

  it('backfills a legacy result only when version and session identities match', () => {
    const registry = createLegacyRegistry();
    mocks.readAISessionStore.mockReturnValue({ status: 'missing' });
    mocks.readCodexThreadRegistry.mockReturnValue({ status: 'valid', registry });
    mocks.readAnalysisState.mockReturnValue({
      status: 'valid',
      state: {
        schemaVersion: 2,
        currentResult: {
          analysisFingerprint: HASH,
          stale: false,
          basedOnPartial: false,
          resultVersionId: 'v000001',
        },
      },
    });
    mocks.readStoredResultVersion.mockReturnValue({
      status: 'valid',
      version: {
        metadata: {
          provider: 'codex',
          localSessionId: SESSION_ID,
          externalThreadId: 'thread-1',
          promptHash: HASH,
          analysisFingerprint: HASH,
          versionId: 'v000001',
          createdAt: '2026-08-02T02:30:00.000Z',
          savedAt: '2026-08-02T02:31:00.000Z',
        },
      },
    });

    ensureCodexSessionRegistry('alice', () => NOW);
    expect(mocks.writeAISessionState.mock.calls[0]?.[1]).toMatchObject({
      lastSuccessfulAnalysisAt: '2026-08-02T02:30:00.000Z',
      lastResultVersionId: 'v000001',
      lastAnalysisFingerprint: HASH,
      lastUsedAt: '2026-08-02T02:30:00.000Z',
    });
  });

  it('continues an interrupted migration only for identical provider files', () => {
    const registry = createLegacyRegistry();
    const { session } = createPersistedStore();
    mocks.readAISessionStore.mockReturnValue({ status: 'missing' });
    mocks.readCodexThreadRegistry.mockReturnValue({ status: 'valid', registry });
    mocks.readAISessionState.mockReturnValue({ status: 'valid', session });

    ensureCodexSessionRegistry('alice', () => NOW);
    expect(mocks.writeAISessionState).not.toHaveBeenCalled();

    mocks.readAISessionState.mockReturnValue({
      status: 'valid',
      session: { ...session, model: 'different' },
    });
    expect(() => ensureCodexSessionRegistry('alice', () => NOW)).toThrow(
      AISessionMigrationConflictError,
    );
  });

  it('reports a migration write failure without publishing the index', () => {
    const registry = createLegacyRegistry();
    mocks.readAISessionStore.mockReturnValue({ status: 'missing' });
    mocks.readCodexThreadRegistry.mockReturnValue({ status: 'valid', registry });
    mocks.writeAISessionState.mockImplementationOnce(() => {
      throw new Error('write failed');
    });

    expect(() => ensureCodexSessionRegistry('alice', () => NOW)).toThrow(
      AISessionMigrationFailedError,
    );
    expect(mocks.writeAISessionIndex).not.toHaveBeenCalled();
  });

  it('rejects a legacy registry beside an unmarked or mismatched session index', () => {
    const registry = createLegacyRegistry();
    const { index, session } = createPersistedStore();
    mocks.readAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });
    mocks.readCodexThreadRegistry.mockReturnValue({ status: 'valid', registry });

    expect(() => ensureCodexSessionRegistry('alice', () => NOW)).toThrow(
      AISessionMigrationConflictError,
    );

    mocks.readAISessionStore.mockReturnValue({
      status: 'valid',
      index: {
        ...index,
        migration: {
          source: 'codex-sessions-v1',
          sourceHash: 'b'.repeat(64),
          completedAt: NOW.toISOString(),
        },
      },
      sessions: [session],
    });
    expect(() => ensureCodexSessionRegistry('alice', () => NOW)).toThrow(
      AISessionMigrationConflictError,
    );
  });

  it('writes Codex state before replacing its index projection', () => {
    const { index, session } = createPersistedStore();
    mocks.readAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });

    const next = updateCodexSessionRegistry(
      'alice',
      (registry) => ({
        ...registry,
        sessions: [
          {
            ...registry.sessions[0]!,
            lastUsedAt: '2026-08-02T02:30:00.000Z',
          },
        ],
      }),
      () => NOW,
    );

    expect(next.sessions[0]?.lastUsedAt).toBe('2026-08-02T02:30:00.000Z');
    expect(mocks.writeAISessionState.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeAISessionIndex.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.writeAISessionIndex.mock.calls[0]?.[1]).toMatchObject({
      sessions: [{ lastUsedAt: '2026-08-02T02:30:00.000Z' }],
      updatedAt: NOW.toISOString(),
    });
  });

  it('removes a completed pending analysis from persisted Codex state', () => {
    const { index, session } = createPersistedStore();
    const pendingSession: CodexSessionStateV1 = {
      ...session,
      pendingAnalysis: {
        deliveryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        providerKey: `codex:${HASH}`,
        analysisFingerprint: HASH,
        payloadHash: HASH,
        basedOnPartial: false,
        deliveryMode: 'change',
        reasoningEffort: 'high',
        turnId: 'analysis-turn',
      },
    };
    mocks.readAISessionStore.mockReturnValue({
      status: 'valid',
      index,
      sessions: [pendingSession],
    });

    updateCodexSessionRegistry('alice', (registry) => {
      const completed = { ...registry.sessions[0]! };
      delete completed.pendingAnalysis;
      return { ...registry, sessions: [completed] };
    });

    const persisted = mocks.writeAISessionState.mock.calls[0]?.[1] as CodexSessionStateV1;
    expect(persisted).not.toHaveProperty('pendingAnalysis');
    expect(persisted).toMatchObject({
      localSessionId: SESSION_ID,
      lastTurnId: 'analysis-turn',
    });
  });

  it('clears the last successful provider with the active Codex session', () => {
    const { index, session } = createPersistedStore();
    mocks.readAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });

    const registry = updateCodexSessionRegistry('alice', (current) => ({
      ...current,
      activeSessionId: null,
      sessions: [],
    }));

    expect(registry.activeSessionId).toBeNull();
    expect(mocks.writeAISessionState).not.toHaveBeenCalled();
    expect(mocks.writeAISessionIndex).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({
        lastSuccessfulAnalysisProvider: null,
        activeByProvider: {},
      }),
    );
  });
});
