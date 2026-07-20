import { describe, expect, it, vi } from 'vitest';
import type { CodexThreadInfo, CodexThreadSessionInfo } from '@/infra/codex';
import type { CodexThreadState } from '../thread-state';
import { resumeCodexThread } from '../thread-resume';

function createState(): CodexThreadState {
  return {
    kind: 'codex',
    schemaVersion: 1,
    localSessionId: 'local-1',
    threadId: 'thread-1',
    generation: 1,
    displayName: 'alice-insight',
    promptHash: 'a'.repeat(64),
    bootstrapStatus: 'ready',
    promptTurnId: 'turn-prompt',
    initialAnalysisTurnId: 'turn-analysis',
    lastTurnId: 'turn-analysis',
    model: 'gpt-current',
    lastReasoningEffort: 'high',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.144.5',
    projectPath: 'D:\\Data',
    instructionSources: [],
    createdAt: '2026-07-19T01:00:00.000Z',
    lastUsedAt: '2026-07-19T02:00:00.000Z',
  };
}

function createThread(overrides: Partial<CodexThreadInfo> = {}): CodexThreadInfo {
  return {
    id: 'thread-1',
    name: 'alice-insight',
    cwd: 'D:\\Data',
    status: { type: 'idle' },
    turns: [],
    ...overrides,
  };
}

function createSession(overrides: Partial<CodexThreadSessionInfo> = {}): CodexThreadSessionInfo {
  const reasoningEffort =
    overrides.reasoningEffort === undefined ? 'high' : overrides.reasoningEffort;
  return {
    thread: createThread(),
    model: 'gpt-current',
    cwd: 'D:\\Data',
    instructionSources: [],
    ...overrides,
    reasoningEffort,
  };
}

describe('resumeCodexThread', () => {
  it('should return validated resume metadata and a complete thread snapshot', async () => {
    const session = createSession({ instructionSources: ['D:\\Data\\AGENTS.md'] });
    const thread = createThread({ turns: [] });
    const connection = {
      resumeThread: vi.fn(async () => session),
      readThread: vi.fn(async () => thread),
    };

    await expect(
      resumeCodexThread({ state: createState(), connection, platform: 'win32' }),
    ).resolves.toEqual({ session, thread });
    expect(connection.resumeThread).toHaveBeenCalledWith({
      threadId: 'thread-1',
      model: 'gpt-current',
      cwd: 'D:\\Data',
    });
    expect(connection.readThread).toHaveBeenCalledWith('thread-1');
  });

  it.each([
    ['thread_mismatch', createSession({ thread: createThread({ id: 'other-thread' }) })],
    ['model_mismatch', createSession({ model: 'gpt-other' })],
    ['project_mismatch', createSession({ cwd: 'D:\\Other' })],
    ['project_mismatch', createSession({ thread: createThread({ cwd: 'D:\\Other' }) })],
  ] as const)('should reject %s resume metadata', async (code, session) => {
    const connection = {
      resumeThread: vi.fn(async () => session),
      readThread: vi.fn(async () => createThread()),
    };

    await expect(
      resumeCodexThread({ state: createState(), connection, platform: 'win32' }),
    ).rejects.toMatchObject({ code });
    expect(connection.readThread).not.toHaveBeenCalled();
  });

  it('should validate the independently read thread identity', async () => {
    const connection = {
      resumeThread: vi.fn(async () => createSession()),
      readThread: vi.fn(async () => createThread({ id: 'other-thread' })),
    };

    await expect(
      resumeCodexThread({ state: createState(), connection, platform: 'win32' }),
    ).rejects.toMatchObject({ code: 'thread_mismatch' });
  });

  it('should compare Windows Project paths case-insensitively', async () => {
    const connection = {
      resumeThread: vi.fn(async () =>
        createSession({ cwd: 'd:\\data', thread: createThread({ cwd: 'd:\\data' }) }),
      ),
      readThread: vi.fn(async () => createThread({ cwd: 'd:\\data' })),
    };

    await expect(
      resumeCodexThread({ state: createState(), connection, platform: 'win32' }),
    ).resolves.toBeDefined();
  });
});
