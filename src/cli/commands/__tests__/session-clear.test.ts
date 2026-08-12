import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAISessionSummary } from '@/core/ai/sessions/summary';

const mocks = vi.hoisted(() => ({
  readStore: vi.fn(),
  inspectCodexStorage: vi.fn(),
  readDataFileResult: vi.fn(),
  deleteSession: vi.fn(),
  ensureCodexRegistry: vi.fn(),
  withSessionLock: vi.fn(),
  withCodexLock: vi.fn(),
  selectControlRuntime: vi.fn(),
  deleteThread: vi.fn(),
  closeRuntime: vi.fn(),
  renderNotice: vi.fn(),
  loggerDiagnostic: vi.fn(),
  loggerError: vi.fn(),
  PersistError: class extends Error {},
  IndexLockBusyError: class extends Error {},
  StoreCorruptError: class extends Error {},
  MigrationConflictError: class extends Error {},
  MigrationFailedError: class extends Error {},
}));

vi.mock('@/config', () => ({
  getConfig: vi.fn(() => ({ ai: {}, proxy: undefined })),
  resolveCodexConfig: vi.fn(() => ({
    model: 'app-default',
    reasoningEffort: 'model-default',
    startupTimeout: 5_000,
    turnTimeout: 30_000,
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
  logger: { diagnostic: mocks.loggerDiagnostic, error: mocks.loggerError },
}));

vi.mock('@/infra/storage', () => ({
  AISessionIndexLockBusyError: mocks.IndexLockBusyError,
  AISessionMigrationConflictError: mocks.MigrationConflictError,
  AISessionMigrationFailedError: mocks.MigrationFailedError,
  AISessionPersistError: mocks.PersistError,
  AISessionStoreCorruptError: mocks.StoreCorruptError,
  ChatSessionMissingError: class extends Error {},
  deleteAISession: mocks.deleteSession,
  ensureCodexSessionRegistry: mocks.ensureCodexRegistry,
  getAISessionFilePath: vi.fn(
    (username, provider, localSessionId) =>
      `C:\\data\\${username}\\sessions\\${provider}\\${localSessionId}.json`,
  ),
  getAISessionIndexPath: vi.fn((username) => `C:\\data\\${username}\\sessions\\index.json`),
  inspectCodexSessionStorage: mocks.inspectCodexStorage,
  readAISessionStore: mocks.readStore,
  readDataFileResult: mocks.readDataFileResult,
  withAISessionLock: mocks.withSessionLock,
  withCodexExecutionLock: mocks.withCodexLock,
}));

vi.mock('../../workflow/notices', () => ({ renderNotice: mocks.renderNotice }));

import { runSessionClear } from '../session-clear';

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
  createdAt: '2026-08-08T02:00:00.000Z',
  lastUsedAt: '2026-08-08T02:00:00.000Z',
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
  executableVersion: '0.137.0',
  projectPath: 'D:\\data',
  instructionSources: [],
};

function createStore(lastProvider: 'gemini' | 'codex' = 'gemini') {
  return {
    status: 'valid' as const,
    index: {
      schemaVersion: 1 as const,
      lastSuccessfulAnalysisProvider: lastProvider,
      activeByProvider: { gemini: GEMINI_TWO_ID, codex: CODEX_ONE_ID },
      sessions: [
        createAISessionSummary(geminiOne),
        createAISessionSummary(geminiTwo),
        createAISessionSummary(codexOne),
      ],
      updatedAt: '2026-08-08T02:00:00.000Z',
    },
    sessions: [geminiOne, geminiTwo, codexOne],
  };
}

describe('session clear command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readStore.mockReturnValue(createStore());
    mocks.inspectCodexStorage.mockReturnValue({ migration: 'not_required' });
    mocks.readDataFileResult.mockReturnValue({ status: 'success', data: {} });
    mocks.withSessionLock.mockImplementation(async (_user, _provider, _session, operation) =>
      operation(),
    );
    mocks.withCodexLock.mockImplementation(async (_user, operation) => operation());
    mocks.deleteSession.mockImplementation((_user, index) => index);
    mocks.selectControlRuntime.mockResolvedValue({
      connection: { deleteThread: mocks.deleteThread, close: mocks.closeRuntime },
    });
    mocks.deleteThread.mockResolvedValue(undefined);
    mocks.closeRuntime.mockResolvedValue(undefined);
  });

  it('lists the scope and refuses a non-interactive deletion', async () => {
    mocks.readDataFileResult.mockReturnValue({ status: 'missing' });

    const result = await runSessionClear(
      'alice',
      {},
      { isInteractive: () => false, confirm: vi.fn() },
    );

    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'SESSION_CONFIRMATION_REQUIRED',
      deleted: 0,
    });
    expect(mocks.loggerDiagnostic).toHaveBeenCalledWith(
      'info',
      expect.stringContaining(`session=${GEMINI_TWO_ID}`),
    );
    expect(mocks.renderNotice).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SESSION_SOURCE_DATA_MISSING' }),
    );
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it('cancels without changing local or external state', async () => {
    const result = await runSessionClear(
      'alice',
      { provider: 'codex' },
      { isInteractive: () => true, confirm: vi.fn().mockResolvedValue(false) },
    );

    expect(result).toEqual({
      status: 'cancelled',
      reasonCode: 'SESSION_CLEAR_CANCELLED',
      deleted: 0,
      notices: [],
    });
    expect(mocks.selectControlRuntime).not.toHaveBeenCalled();
    expect(mocks.deleteThread).not.toHaveBeenCalled();
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it('deletes a Codex thread before removing its local mapping', async () => {
    const calls: string[] = [];
    mocks.deleteThread.mockImplementation(async () => {
      calls.push('external');
    });
    mocks.deleteSession.mockImplementation((_user, index) => {
      calls.push('local');
      return index;
    });

    const result = await runSessionClear(
      'alice',
      { provider: 'codex' },
      { isInteractive: () => true, confirm: vi.fn().mockResolvedValue(true) },
    );

    expect(result).toEqual({ status: 'success', deleted: 1, notices: [] });
    expect(mocks.withCodexLock).toHaveBeenCalledOnce();
    expect(mocks.deleteThread).toHaveBeenCalledWith('thread-1');
    expect(calls).toEqual(['external', 'local']);
    expect(mocks.closeRuntime).toHaveBeenCalledOnce();
  });

  it('reports an external Codex deletion failure and closes the runtime', async () => {
    mocks.deleteThread.mockRejectedValue(new Error('external deletion failed'));

    const result = await runSessionClear(
      'alice',
      { provider: 'codex' },
      { isInteractive: () => true, confirm: vi.fn().mockResolvedValue(true) },
    );

    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'SESSION_DELETE_FAILED',
      deleted: 0,
    });
    expect(mocks.deleteThread).toHaveBeenCalledOnce();
    expect(mocks.deleteThread).toHaveBeenCalledWith('thread-1');
    expect(mocks.deleteSession).not.toHaveBeenCalled();
    expect(mocks.closeRuntime).toHaveBeenCalledOnce();
  });

  it('rejects a scope that changes after confirmation and before deletion', async () => {
    const changed = createStore();
    changed.index.activeByProvider.gemini = GEMINI_ONE_ID;
    mocks.readStore.mockReturnValueOnce(createStore()).mockReturnValueOnce(changed);

    const result = await runSessionClear(
      'alice',
      { provider: 'gemini' },
      { isInteractive: () => true, confirm: vi.fn().mockResolvedValue(true) },
    );

    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'SESSION_PERSIST_FAILED',
      deleted: 0,
    });
    expect(mocks.deleteSession).not.toHaveBeenCalled();
    expect(mocks.deleteThread).not.toHaveBeenCalled();
  });
});
