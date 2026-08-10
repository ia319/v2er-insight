import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inspectContext: vi.fn(),
  createSession: vi.fn(),
  sendMessage: vi.fn(),
  selectChatSession: vi.fn(),
  completeGeminiChatSession: vi.fn(),
  withAISessionLock: vi.fn(),
  withCodexExecutionLock: vi.fn(),
  readAISessionIndex: vi.fn(),
  inspectCodexSessionStorage: vi.fn(),
  loggerError: vi.fn(),
  loggerDiagnostic: vi.fn(),
  providerConstructor: vi.fn(),
  discoverCodexExecutables: vi.fn(),
  selectCodexRuntime: vi.fn(),
  sendCodexChatTurn: vi.fn(),
  ensureCodexSessionRegistry: vi.fn(),
  updateCodexSessionRegistry: vi.fn(),
  closeCodexRuntime: vi.fn(),
  IndexLockBusyError: class extends Error {},
  TurnResultError: class extends Error {
    readonly codexErrorInfo: string;

    constructor(codexErrorInfo: string) {
      super('Codex turn failed');
      this.codexErrorInfo = codexErrorInfo;
    }
  },
}));

vi.mock('@/config', () => ({
  AI_PROVIDERS: ['gemini', 'codex'],
  THINKING_LEVELS: ['minimal', 'low', 'medium', 'high'],
  getConfig: vi.fn(() => ({ ai: { provider: 'codex' } })),
  resolveGeminiConfig: vi.fn(() => ({
    model: 'configured-model',
    thinkingLevel: 'medium',
    timeout: 30_000,
    maxRetries: 0,
    baseDelay: 1,
    maxDelay: 1,
  })),
  resolveCodexConfig: vi.fn(() => ({
    startupTimeout: 10_000,
    shutdownGrace: 1_000,
    turnTimeout: 30_000,
    reasoningEffort: 'medium',
  })),
}));

vi.mock('@/core/ai', () => ({
  GeminiProvider: class {
    constructor(apiKey: string, model: string) {
      mocks.providerConstructor(apiKey, model);
    }

    inspectContext = mocks.inspectContext;
    createSession = mocks.createSession;
    sendMessage = mocks.sendMessage;
  },
  resolveApiKey: vi.fn(() => 'secret'),
}));

vi.mock('@/core/ai/providers/codex', () => ({
  CodexChatTurnError: class extends Error {},
  CodexTurnResultError: mocks.TurnResultError,
  sendCodexChatTurn: mocks.sendCodexChatTurn,
  selectCodexRuntime: mocks.selectCodexRuntime,
}));

vi.mock('@/infra/codex', () => ({ discoverCodexExecutables: mocks.discoverCodexExecutables }));
vi.mock('@/infra/logger', () => ({
  logger: { error: mocks.loggerError, diagnostic: mocks.loggerDiagnostic },
}));
vi.mock('@/infra/storage', () => ({
  AISessionIndexLockBusyError: mocks.IndexLockBusyError,
  AISessionLockBusyError: class extends Error {},
  AISessionPersistError: class extends Error {},
  AISessionStoreCorruptError: class extends Error {},
  ChatSessionMissingError: class extends Error {},
  CodexExecutionLockBusyError: class extends Error {},
  completeGeminiChatSession: mocks.completeGeminiChatSession,
  ensureCodexSessionRegistry: mocks.ensureCodexSessionRegistry,
  inspectCodexSessionStorage: mocks.inspectCodexSessionStorage,
  readAISessionIndex: mocks.readAISessionIndex,
  selectChatSession: mocks.selectChatSession,
  updateCodexSessionRegistry: mocks.updateCodexSessionRegistry,
  withAISessionLock: mocks.withAISessionLock,
  withCodexExecutionLock: mocks.withCodexExecutionLock,
}));

import { runChat } from '../chat';

const selection = {
  provider: 'gemini' as const,
  index: {
    schemaVersion: 1 as const,
    lastSuccessfulAnalysisProvider: 'gemini' as const,
    activeByProvider: { gemini: 'session-1' },
    sessions: [],
    updatedAt: '2026-08-08T01:00:00.000Z',
  },
  session: {
    schemaVersion: 1 as const,
    localSessionId: 'session-1',
    username: 'alice',
    provider: 'gemini' as const,
    generation: 1,
    promptHash: 'a'.repeat(64),
    model: 'persisted-model',
    createdAt: '2026-08-08T01:00:00.000Z',
    lastUsedAt: '2026-08-08T01:00:00.000Z',
    lastSuccessfulAnalysisAt: null,
    lastResultVersionId: null,
    lastAnalysisFingerprint: null,
    systemInstruction: 'Persisted instruction',
    thinkingLevel: 'high',
    history: [
      { role: 'user' as const, parts: [{ text: 'old request' }] },
      { role: 'model' as const, parts: [{ text: 'old response' }] },
    ],
  },
};

const codexSelection = {
  provider: 'codex' as const,
  index: {
    ...selection.index,
    lastSuccessfulAnalysisProvider: 'codex' as const,
    activeByProvider: { codex: 'codex-session-1' },
  },
  session: {
    kind: 'codex' as const,
    schemaVersion: 1 as const,
    localSessionId: 'codex-session-1',
    threadId: 'thread-1',
    generation: 1,
    displayName: 'alice-insight',
    promptHash: 'a'.repeat(64),
    bootstrapStatus: 'ready' as const,
    promptTurnId: 'prompt-1',
    initialAnalysisTurnId: 'analysis-1',
    lastTurnId: 'analysis-1',
    model: 'persisted-codex-model',
    lastReasoningEffort: 'high',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.144.5',
    projectPath: 'D:\\data',
    instructionSources: [],
    createdAt: '2026-08-08T01:00:00.000Z',
    lastUsedAt: '2026-08-08T01:00:00.000Z',
  },
};

describe('chat command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectChatSession.mockReturnValue(selection);
    mocks.withAISessionLock.mockImplementation(async (_user, _provider, _session, operation) =>
      operation(),
    );
    mocks.withCodexExecutionLock.mockImplementation(async (_user, operation) => operation());
    mocks.readAISessionIndex.mockReturnValue({ status: 'valid', index: selection.index });
    mocks.inspectCodexSessionStorage.mockReturnValue({ migration: 'not_required' });
    mocks.inspectContext.mockResolvedValue({
      source: 'sdk',
      used: 50,
      limit: 100,
      nearLimit: false,
      tooLong: false,
    });
    mocks.sendMessage.mockResolvedValue('reply');
    mocks.discoverCodexExecutables.mockReturnValue({ launchCandidates: ['candidate'] });
    mocks.selectCodexRuntime.mockResolvedValue({
      model: { model: 'persisted-codex-model', reasoningEffort: 'high' },
      connection: {
        resumeThread: vi.fn(),
        readThread: vi.fn(),
        runTurn: vi.fn(),
        close: mocks.closeCodexRuntime,
      },
    });
    mocks.ensureCodexSessionRegistry.mockReturnValue({
      schemaVersion: 1,
      activeSessionId: codexSelection.session.localSessionId,
      sessions: [codexSelection.session],
    });
    mocks.sendCodexChatTurn.mockResolvedValue({ message: { text: 'codex reply' } });
    mocks.closeCodexRuntime.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reconstructs Gemini from persisted settings and writes only the reply to stdout', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const result = await runChat('alice', 'new question', { provider: 'gemini' });

    expect(result).toEqual({ status: 'success', provider: 'gemini', notices: undefined });
    expect(mocks.providerConstructor).toHaveBeenCalledWith('secret', 'persisted-model');
    expect(mocks.inspectContext).toHaveBeenCalledWith(
      'Persisted instruction',
      'new question',
      expect.objectContaining({ history: selection.session.history }),
    );
    expect(mocks.createSession).toHaveBeenCalledWith('Persisted instruction', {
      thinkingLevel: 'high',
      history: selection.session.history,
      timeout: 30_000,
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith('new question');
    expect(mocks.completeGeminiChatSession).toHaveBeenCalledWith(
      'alice',
      selection,
      'new question',
      'reply',
    );
    expect(stdout).toHaveBeenCalledOnce();
    expect(stdout).toHaveBeenCalledWith('reply\n');
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it('returns a warning while allowing a near-limit provider request', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mocks.inspectContext.mockResolvedValue({
      source: 'sdk',
      used: 91,
      limit: 100,
      nearLimit: true,
      tooLong: false,
    });

    const result = await runChat('alice', 'new question', { provider: 'gemini' });

    expect(result.notices).toEqual([
      expect.objectContaining({ code: 'SESSION_CONTEXT_NEAR_LIMIT', severity: 'warning' }),
    ]);
  });

  it('uses the persisted Codex model inside both session locks', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mocks.selectChatSession.mockReturnValue(codexSelection);
    mocks.closeCodexRuntime.mockRejectedValueOnce(new Error('close failed'));

    const result = await runChat('alice', 'new question', { provider: 'codex' });

    expect(result).toEqual({ status: 'success', provider: 'codex', notices: undefined });
    expect(mocks.withCodexExecutionLock).toHaveBeenCalledWith('alice', expect.any(Function));
    expect(mocks.withAISessionLock).toHaveBeenCalledWith(
      'alice',
      'codex',
      'codex-session-1',
      expect.any(Function),
    );
    expect(mocks.selectCodexRuntime).toHaveBeenCalledWith(
      ['candidate'],
      expect.objectContaining({
        model: { model: 'persisted-codex-model', reasoningEffort: 'high' },
      }),
    );
    expect(mocks.sendCodexChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        state: codexSelection.session,
        message: 'new question',
        reasoningEffort: 'high',
      }),
    );
    expect(mocks.closeCodexRuntime).toHaveBeenCalledOnce();
    expect(mocks.loggerDiagnostic).toHaveBeenCalledWith(
      'warn',
      'Codex chat runtime close failed: close failed',
    );
    expect(stdout).toHaveBeenCalledWith('codex reply\n');
  });

  it('pins the default provider before choosing the Codex execution lock', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mocks.selectChatSession.mockImplementation((_username, provider) =>
      provider === 'gemini' ? selection : codexSelection,
    );

    const result = await runChat('alice', 'new question', {});

    expect(result).toEqual({ status: 'success', provider: 'gemini', notices: undefined });
    expect(mocks.selectChatSession).toHaveBeenCalledWith('alice', 'gemini');
    expect(mocks.withCodexExecutionLock).not.toHaveBeenCalled();
    expect(mocks.sendCodexChatTurn).not.toHaveBeenCalled();
  });

  it('keeps the resolved Codex provider in context-limit recovery', async () => {
    mocks.readAISessionIndex.mockReturnValue({ status: 'valid', index: codexSelection.index });
    mocks.selectChatSession.mockReturnValue(codexSelection);
    mocks.sendCodexChatTurn.mockRejectedValue(new mocks.TurnResultError('contextWindowExceeded'));

    const result = await runChat('alice', 'new question', {});

    expect(result).toMatchObject({
      status: 'failed',
      provider: 'codex',
      reasonCode: 'CHAT_CONTEXT_TOO_LONG',
      recoverActions: [
        expect.objectContaining({
          content: 'v2er ai alice --provider codex --new-thread',
        }),
      ],
    });
    expect(mocks.withCodexExecutionLock).toHaveBeenCalledOnce();
  });

  it('does not call the provider or write stdout when preflight is over the limit', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mocks.inspectContext.mockResolvedValue({
      source: 'sdk',
      used: 100,
      limit: 100,
      nearLimit: true,
      tooLong: true,
    });

    const result = await runChat('alice', 'new question', { provider: 'gemini' });

    expect(result).toMatchObject({ status: 'failed', reasonCode: 'CHAT_CONTEXT_TOO_LONG' });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.completeGeminiChatSession).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
  });

  it('rejects an invalid provider before reading or changing session state', async () => {
    const result = await runChat('alice', 'question', { provider: 'other' });

    expect(result).toEqual({
      status: 'failed',
      provider: null,
      reasonCode: 'CHAT_SESSION_INVALID',
    });
    expect(mocks.selectChatSession).not.toHaveBeenCalled();
    expect(mocks.withAISessionLock).not.toHaveBeenCalled();
  });
});
