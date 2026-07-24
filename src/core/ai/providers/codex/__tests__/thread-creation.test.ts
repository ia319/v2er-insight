import { describe, expect, it, vi } from 'vitest';
import type { CodexThreadSessionInfo } from '@/infra/codex';
import { appendPendingCodexThreadState } from '../thread-registry';
import type { CodexThreadRegistryV1, CodexThreadState } from '../thread-state';
import {
  createCodexThreadGeneration,
  type CreateCodexThreadGenerationOptions,
} from '../thread-creation';

const EMPTY_REGISTRY: CodexThreadRegistryV1 = {
  schemaVersion: 1,
  activeSessionId: null,
  sessions: [],
};

function createPendingState(overrides: Partial<CodexThreadState> = {}): CodexThreadState {
  return {
    kind: 'codex',
    schemaVersion: 1,
    localSessionId: 'existing-local',
    threadId: 'existing-thread',
    generation: 1,
    displayName: 'alice-insight',
    promptHash: 'a'.repeat(64),
    bootstrapStatus: 'promptPending',
    promptTurnId: null,
    initialAnalysisTurnId: null,
    lastTurnId: null,
    model: 'gpt-current',
    lastReasoningEffort: 'high',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.144.5',
    projectPath: 'D:\\Data',
    instructionSources: [],
    createdAt: '2026-07-19T01:00:00.000Z',
    lastUsedAt: '2026-07-19T01:00:00.000Z',
    ...overrides,
  };
}

function createSession(overrides: Partial<CodexThreadSessionInfo> = {}): CodexThreadSessionInfo {
  return {
    thread: {
      id: 'thread-1',
      name: null,
      cwd: 'D:\\Data',
      status: { type: 'idle' },
      turns: [],
    },
    model: 'gpt-current',
    cwd: 'D:\\Data',
    instructionSources: ['D:\\Data\\AGENTS.md'],
    reasoningEffort: null,
    ...overrides,
  };
}

function createOptions(overrides: Partial<CreateCodexThreadGenerationOptions> = {}) {
  const events: string[] = [];
  const session = createSession();
  const connection = {
    startThread: vi.fn(async () => {
      events.push('start');
      return session;
    }),
    setThreadName: vi.fn(async () => {
      events.push('name');
    }),
  };
  const persistPending = vi.fn((state: CodexThreadState) => {
    events.push('persist');
    return appendPendingCodexThreadState(EMPTY_REGISTRY, state);
  });

  const options: CreateCodexThreadGenerationOptions = {
    username: 'alice',
    registry: EMPTY_REGISTRY,
    runtime: {
      executablePath: 'C:\\App\\codex.exe',
      executableVersion: '0.144.5',
      model: 'gpt-current',
      reasoningEffort: 'high',
      connection,
    },
    projectPath: 'D:\\Data',
    promptHash: 'a'.repeat(64),
    persistPending,
    createLocalSessionId: () => 'local-1',
    now: () => new Date('2026-07-19T03:00:00.000Z'),
    platform: 'win32',
    ...overrides,
  };

  return {
    events,
    connection,
    persistPending,
    options,
  };
}

describe('createCodexThreadGeneration', () => {
  it('should persist a recoverable pending state before naming the thread', async () => {
    const fixture = createOptions();
    const result = await createCodexThreadGeneration(fixture.options);

    expect(fixture.events).toEqual(['start', 'persist', 'name']);
    expect(fixture.connection.startThread).toHaveBeenCalledWith({
      model: 'gpt-current',
      cwd: 'D:\\Data',
    });
    expect(fixture.connection.setThreadName).toHaveBeenCalledWith('thread-1', 'alice-insight');
    expect(result.state).toMatchObject({
      localSessionId: 'local-1',
      threadId: 'thread-1',
      displayName: 'alice-insight',
      bootstrapStatus: 'promptPending',
      promptHash: 'a'.repeat(64),
      model: 'gpt-current',
      lastReasoningEffort: 'high',
      projectPath: 'D:\\Data',
      instructionSources: ['D:\\Data\\AGENTS.md'],
      createdAt: '2026-07-19T03:00:00.000Z',
    });
    expect(result.registry.sessions).toEqual([result.state]);
  });

  it('should accept case-only Windows Project differences', async () => {
    const fixture = createOptions({ projectPath: 'd:\\data' });
    await expect(createCodexThreadGeneration(fixture.options)).resolves.toBeDefined();
  });

  it.each([
    ['model_mismatch', createSession({ model: 'gpt-other' })],
    ['project_mismatch', createSession({ cwd: 'D:\\Other' })],
    [
      'project_mismatch',
      createSession({ thread: { ...createSession().thread, cwd: 'D:\\Other' } }),
    ],
  ] as const)('should reject a %s response before persistence', async (code, session) => {
    const fixture = createOptions();
    fixture.connection.startThread.mockResolvedValue(session);

    await expect(createCodexThreadGeneration(fixture.options)).rejects.toMatchObject({ code });
    expect(fixture.persistPending).not.toHaveBeenCalled();
    expect(fixture.connection.setThreadName).not.toHaveBeenCalled();
  });

  it('should reject a local session collision before creating a thread', async () => {
    const existing = appendPendingCodexThreadState(
      EMPTY_REGISTRY,
      createPendingState({ localSessionId: 'local-1' }),
    );
    const fixture = createOptions({ registry: existing });

    await expect(createCodexThreadGeneration(fixture.options)).rejects.toMatchObject({
      code: 'local_session_id_conflict',
    });
    expect(fixture.connection.startThread).not.toHaveBeenCalled();
  });

  it('should reject a returned thread ID that is already registered', async () => {
    const existing = appendPendingCodexThreadState(
      EMPTY_REGISTRY,
      createPendingState({ threadId: 'thread-1' }),
    );
    const fixture = createOptions({ registry: existing });

    await expect(createCodexThreadGeneration(fixture.options)).rejects.toMatchObject({
      code: 'thread_id_conflict',
    });
    expect(fixture.persistPending).not.toHaveBeenCalled();
  });

  it('should reject a persistence result that omits the pending state', async () => {
    const fixture = createOptions({ persistPending: () => EMPTY_REGISTRY });

    await expect(createCodexThreadGeneration(fixture.options)).rejects.toMatchObject({
      code: 'persistence_mismatch',
    });
    expect(fixture.connection.setThreadName).not.toHaveBeenCalled();
  });

  it('should preserve the pending state when naming fails', async () => {
    const fixture = createOptions();
    fixture.connection.setThreadName.mockRejectedValue(new Error('name failed'));

    await expect(createCodexThreadGeneration(fixture.options)).rejects.toThrow('name failed');
    expect(fixture.persistPending).toHaveBeenCalledOnce();
  });
});
