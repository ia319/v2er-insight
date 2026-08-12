import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  withSessionLock: vi.fn(),
  selectControlRuntime: vi.fn(),
  deleteThread: vi.fn(),
  closeRuntime: vi.fn(),
  loggerDiagnostic: vi.fn(),
}));

vi.mock('@/config', () => ({
  getConfig: vi.fn(() => ({ ai: {}, proxy: undefined })),
  resolveCodexConfig: vi.fn(() => ({
    startupTimeout: 5_000,
    shutdownGrace: 1_000,
  })),
}));

vi.mock('@/core/ai/providers/codex', () => ({
  selectCodexControlRuntime: mocks.selectControlRuntime,
}));

vi.mock('@/infra/codex', () => ({
  discoverCodexExecutables: vi.fn(() => ({ launchCandidates: [{ path: 'codex.exe' }] })),
}));

vi.mock('@/infra/logger', () => ({
  logger: { diagnostic: mocks.loggerDiagnostic },
}));

vi.mock('@/infra/storage', () => ({
  deleteAISession: mocks.deleteSession,
  withAISessionLock: mocks.withSessionLock,
}));

import {
  SessionClearExecutionError,
  SessionDeleteUnsupportedError,
  clearConfirmedSessionScope,
  withSessionClearLocks,
} from '../execution';

const GEMINI_ONE_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb810';
const GEMINI_TWO_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb811';
const CODEX_ONE_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb812';

const geminiOne = {
  schemaVersion: 1 as const,
  localSessionId: GEMINI_ONE_ID,
  username: 'alice',
  provider: 'gemini' as const,
  generation: 1,
  promptHash: 'a'.repeat(64),
  model: 'gemini-current',
  createdAt: '2026-08-08T01:00:00.000Z',
  lastUsedAt: '2026-08-08T01:00:00.000Z',
  lastSuccessfulAnalysisAt: null,
  lastResultVersionId: null,
  lastAnalysisFingerprint: null,
  systemInstruction: 'Analyze.',
  thinkingLevel: 'high',
  history: [],
};

const geminiTwo = {
  ...geminiOne,
  localSessionId: GEMINI_TWO_ID,
  generation: 2,
};

const codexOne = {
  schemaVersion: 1 as const,
  localSessionId: CODEX_ONE_ID,
  username: 'alice',
  provider: 'codex' as const,
  generation: 1,
  promptHash: 'b'.repeat(64),
  model: 'gpt-current',
  createdAt: '2026-08-08T01:00:00.000Z',
  lastUsedAt: '2026-08-08T01:00:00.000Z',
  lastSuccessfulAnalysisAt: null,
  lastResultVersionId: null,
  lastAnalysisFingerprint: null,
  kind: 'codex' as const,
  threadId: 'thread-1',
  externalThreadId: 'thread-1',
  displayName: 'alice-insight',
  bootstrapStatus: 'ready' as const,
  promptTurnId: 'prompt-1',
  initialAnalysisTurnId: 'analysis-1',
  lastTurnId: 'analysis-1',
  lastReasoningEffort: 'high',
  executablePath: 'codex.exe',
  executableVersion: '0.144.5',
  projectPath: 'D:\\data',
  instructionSources: [],
};

function createScope(sessions = [codexOne, geminiOne, geminiTwo]) {
  return {
    index: {
      schemaVersion: 1 as const,
      lastSuccessfulAnalysisProvider: 'gemini' as const,
      activeByProvider: { codex: CODEX_ONE_ID, gemini: GEMINI_TWO_ID },
      sessions: [],
      updatedAt: '2026-08-08T02:00:00.000Z',
    },
    sessions,
  };
}

describe('session clear execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withSessionLock.mockImplementation(async (_user, _provider, _session, operation) =>
      operation(),
    );
    mocks.deleteSession.mockImplementation((_user, index) => index);
    mocks.selectControlRuntime.mockResolvedValue({
      connection: { deleteThread: mocks.deleteThread, close: mocks.closeRuntime },
    });
    mocks.deleteThread.mockResolvedValue(undefined);
    mocks.closeRuntime.mockResolvedValue(undefined);
  });

  it('acquires every confirmed target lock before running the operation', async () => {
    const calls: string[] = [];
    mocks.withSessionLock.mockImplementation(async (_user, provider, session, operation) => {
      calls.push(`${provider}:${session}`);
      return operation();
    });

    await withSessionClearLocks(
      'alice',
      [
        {
          provider: 'codex',
          localSessionId: CODEX_ONE_ID,
          generation: 1,
          externalThreadId: 'thread-1',
          displayName: null,
        },
        {
          provider: 'gemini',
          localSessionId: GEMINI_ONE_ID,
          generation: 1,
          externalThreadId: null,
          displayName: null,
        },
      ],
      async () => {
        calls.push('operation');
      },
    );

    expect(calls).toEqual([`codex:${CODEX_ONE_ID}`, `gemini:${GEMINI_ONE_ID}`, 'operation']);
  });

  it('deletes Codex externally before local mappings and then clears Gemini', async () => {
    const calls: string[] = [];
    mocks.deleteThread.mockImplementation(async () => {
      calls.push('external:codex');
    });
    mocks.deleteSession.mockImplementation((_user, index, session) => {
      calls.push(`local:${session.provider}:${session.localSessionId}`);
      return index;
    });

    await expect(clearConfirmedSessionScope('alice', createScope())).resolves.toBe(3);
    expect(calls).toEqual([
      'external:codex',
      `local:codex:${CODEX_ONE_ID}`,
      `local:gemini:${GEMINI_ONE_ID}`,
      `local:gemini:${GEMINI_TWO_ID}`,
    ]);
  });

  it('retains the completed count when a later local deletion fails', async () => {
    mocks.deleteSession
      .mockImplementationOnce((_user, index) => index)
      .mockImplementationOnce(() => {
        throw new Error('second deletion failed');
      });

    const error = await clearConfirmedSessionScope(
      'alice',
      createScope([geminiOne, geminiTwo]),
    ).catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      name: 'SessionClearExecutionError',
      deleted: 1,
      message: 'second deletion failed',
    });
  });

  it('reports when an external thread was deleted but local persistence failed', async () => {
    mocks.deleteSession.mockImplementation(() => {
      throw new Error('local deletion failed');
    });

    const error = await clearConfirmedSessionScope('alice', createScope([codexOne])).catch(
      (reason: unknown) => reason,
    );

    expect(error).toMatchObject({
      name: 'SessionClearExecutionError',
      deleted: 0,
      message: expect.stringContaining(
        'was deleted, but its local session mapping could not be removed',
      ),
    });
  });

  it('classifies App Server method-not-found without touching the local mapping', async () => {
    mocks.deleteThread.mockRejectedValue(
      Object.assign(new Error('method not found'), {
        name: 'CodexAppServerRpcError',
        code: -32601,
      }),
    );

    const error = await clearConfirmedSessionScope('alice', createScope([codexOne])).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(SessionClearExecutionError);
    expect(error).toMatchObject({ deleted: 0, failure: expect.any(SessionDeleteUnsupportedError) });
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });
});
