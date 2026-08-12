import { describe, expect, it, vi } from 'vitest';
import type { CodexThreadInfo, CodexTurnInfo } from '@/infra/codex';
import { sendCodexChatTurn, type SendCodexChatTurnOptions } from '../chat-turn';
import type { CodexThreadRegistryV1, CodexThreadState } from '../thread-state';

const HASH = 'a'.repeat(64);
const CREATED_AT = '2026-08-08T01:00:00.000Z';

function createState(): CodexThreadState {
  return {
    kind: 'codex',
    schemaVersion: 1,
    localSessionId: '6d8eea46-7e52-47ca-a740-34a0b01bb810',
    threadId: 'thread-1',
    generation: 1,
    displayName: 'alice-insight',
    promptHash: HASH,
    bootstrapStatus: 'ready',
    promptTurnId: 'prompt-1',
    initialAnalysisTurnId: 'analysis-1',
    lastTurnId: 'analysis-1',
    model: 'gpt-current',
    lastReasoningEffort: 'medium',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.144.5',
    projectPath: 'D:\\data',
    instructionSources: [],
    createdAt: CREATED_AT,
    lastUsedAt: CREATED_AT,
  };
}

function createRegistry(state: CodexThreadState): CodexThreadRegistryV1 {
  return { schemaVersion: 1, activeSessionId: state.localSessionId, sessions: [state] };
}

function createThread(status: CodexThreadInfo['status'] = { type: 'idle' }): CodexThreadInfo {
  return {
    id: 'thread-1',
    name: 'alice-insight',
    cwd: 'D:\\data',
    status,
    turns: [],
  };
}

function createTurn(): CodexTurnInfo {
  return {
    id: 'chat-1',
    status: 'completed',
    error: null,
    agentMessages: [{ id: 'message-1', text: 'answer', phase: 'final_answer' }],
  };
}

function createStartedTurnConnection(
  state: CodexThreadState,
): SendCodexChatTurnOptions['connection'] {
  const thread = createThread();
  const turn = createTurn();
  return {
    resumeThread: vi.fn().mockResolvedValue({
      thread,
      model: state.model,
      cwd: state.projectPath,
      instructionSources: [],
      reasoningEffort: state.lastReasoningEffort,
    }),
    readThread: vi.fn().mockResolvedValue(thread),
    runTurn: vi.fn(async (_options, _timeout, onStarted) => {
      await onStarted?.({ ...turn, status: 'inProgress', agentMessages: [] });
      return turn;
    }),
  };
}

describe('Codex chat turn', () => {
  it('resumes the exact thread and sends a plain turn with persisted acceptance', async () => {
    const state = createState();
    let registry = createRegistry(state);
    const thread = createThread();
    const turn = createTurn();
    const updateRegistry = vi.fn(
      async (update: (value: CodexThreadRegistryV1) => CodexThreadRegistryV1) => {
        registry = update(registry);
        return registry;
      },
    );
    const connection = {
      resumeThread: vi.fn().mockResolvedValue({
        thread,
        model: state.model,
        cwd: state.projectPath,
        instructionSources: [],
        reasoningEffort: state.lastReasoningEffort,
      }),
      readThread: vi.fn().mockResolvedValue(thread),
      runTurn: vi.fn(async (_options, _timeout, onStarted) => {
        await onStarted?.({ ...turn, status: 'inProgress', agentMessages: [] });
        return turn;
      }),
    };

    const result = await sendCodexChatTurn({
      registry,
      state,
      message: 'question',
      reasoningEffort: 'medium',
      timeoutMs: 30_000,
      connection,
      updateRegistry,
      createAttemptId: () => 'attempt-1',
      now: vi
        .fn()
        .mockReturnValueOnce(new Date('2026-08-08T01:01:00.000Z'))
        .mockReturnValueOnce(new Date('2026-08-08T01:02:00.000Z')),
      platform: 'win32',
    });

    expect(connection.resumeThread).toHaveBeenCalledWith({
      threadId: state.threadId,
      model: state.model,
      cwd: state.projectPath,
    });
    expect(connection.runTurn).toHaveBeenCalledWith(
      {
        threadId: state.threadId,
        text: 'question',
        cwd: state.projectPath,
        model: state.model,
        effort: 'medium',
        clientUserMessageId: 'attempt-1',
      },
      30_000,
      expect.any(Function),
    );
    expect(result.message.text).toBe('answer');
    expect(registry.sessions[0]).toMatchObject({
      lastTurnId: 'chat-1',
      lastReasoningEffort: 'medium',
      lastUsedAt: '2026-08-08T01:02:00.000Z',
    });
  });

  it('refuses an active external thread before starting another turn', async () => {
    const state = createState();
    const registry = createRegistry(state);
    const thread = createThread({ type: 'active', activeFlags: [] });
    const connection = {
      resumeThread: vi.fn().mockResolvedValue({
        thread,
        model: state.model,
        cwd: state.projectPath,
        instructionSources: [],
        reasoningEffort: state.lastReasoningEffort,
      }),
      readThread: vi.fn().mockResolvedValue(thread),
      runTurn: vi.fn(),
    };

    await expect(
      sendCodexChatTurn({
        registry,
        state,
        message: 'question',
        reasoningEffort: 'medium',
        timeoutMs: 30_000,
        connection,
        updateRegistry: vi.fn(),
        platform: 'win32',
      }),
    ).rejects.toMatchObject({ name: 'CodexChatTurnError', code: 'thread_busy' });
    expect(connection.runTurn).not.toHaveBeenCalled();
  });

  it('keeps a structured context-window failure from the completed turn', async () => {
    const state = createState();
    let registry = createRegistry(state);
    const thread = createThread();
    const failed: CodexTurnInfo = {
      id: 'chat-1',
      status: 'failed',
      error: {
        message: 'context limit',
        codexErrorInfo: 'contextWindowExceeded',
        additionalDetails: null,
      },
      agentMessages: [],
    };
    const connection = {
      resumeThread: vi.fn().mockResolvedValue({
        thread,
        model: state.model,
        cwd: state.projectPath,
        instructionSources: [],
        reasoningEffort: state.lastReasoningEffort,
      }),
      readThread: vi.fn().mockResolvedValue(thread),
      runTurn: vi.fn(async (_options, _timeout, onStarted) => {
        await onStarted?.({ ...failed, status: 'inProgress', error: null });
        return failed;
      }),
    };

    const error = await sendCodexChatTurn({
      registry,
      state,
      message: 'question',
      reasoningEffort: 'medium',
      timeoutMs: 30_000,
      connection,
      updateRegistry: async (update) => {
        registry = update(registry);
        return registry;
      },
      platform: 'win32',
    }).catch((reason: unknown) => reason);

    expect(error).toMatchObject({
      name: 'CodexTurnResultError',
      code: 'turn_failed',
      codexErrorInfo: 'contextWindowExceeded',
    });
  });

  it('rejects a started turn when the selected session is no longer active', async () => {
    const state = createState();
    const registry = createRegistry(state);
    const connection = createStartedTurnConnection(state);

    await expect(
      sendCodexChatTurn({
        registry,
        state,
        message: 'question',
        reasoningEffort: 'medium',
        timeoutMs: 30_000,
        connection,
        updateRegistry: async (update) => update({ ...registry, activeSessionId: null }),
        platform: 'win32',
      }),
    ).rejects.toMatchObject({ name: 'CodexChatTurnError', code: 'session_not_active' });
  });

  it('rejects a started turn when acceptance is not persisted', async () => {
    const state = createState();
    const registry = createRegistry(state);
    const connection = createStartedTurnConnection(state);

    await expect(
      sendCodexChatTurn({
        registry,
        state,
        message: 'question',
        reasoningEffort: 'medium',
        timeoutMs: 30_000,
        connection,
        updateRegistry: async (update) => {
          update(registry);
          return registry;
        },
        platform: 'win32',
      }),
    ).rejects.toMatchObject({
      name: 'CodexChatTurnError',
      code: 'acceptance_not_persisted',
    });
  });

  it('rejects a completed turn when completion is not persisted', async () => {
    const state = createState();
    let registry = createRegistry(state);
    let updateCount = 0;
    const connection = createStartedTurnConnection(state);

    await expect(
      sendCodexChatTurn({
        registry,
        state,
        message: 'question',
        reasoningEffort: 'high',
        timeoutMs: 30_000,
        connection,
        updateRegistry: async (update) => {
          updateCount += 1;
          const updated = update(registry);
          if (updateCount === 1) registry = updated;
          return registry;
        },
        platform: 'win32',
      }),
    ).rejects.toMatchObject({
      name: 'CodexChatTurnError',
      code: 'completion_not_persisted',
    });
  });
});
