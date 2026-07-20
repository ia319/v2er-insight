import { describe, expect, it, vi } from 'vitest';
import type { CodexThreadInfo, CodexThreadSessionInfo } from '@/infra/codex';
import {
  activateCodexThreadSession,
  completeCodexPromptTurn,
  createPendingCodexThreadState,
  prepareCodexAnalysisDelivery,
  recordCodexInitialAnalysisTurn,
  recordCodexPromptTurn,
} from '../thread-registry';
import type { CodexThreadRegistryV1 } from '../thread-state';
import {
  prepareCodexAnalysisSession,
  type CodexAnalysisSessionRuntime,
} from '../session-preparation';

const PROMPT_HASH = 'a'.repeat(64);

function createThread(turns: CodexThreadInfo['turns'] = []): CodexThreadInfo {
  return {
    id: 'thread-1',
    name: 'alice-insight',
    cwd: 'D:\\Data',
    status: { type: 'idle' },
    turns,
  };
}

function createSession(): CodexThreadSessionInfo {
  return {
    thread: createThread(),
    model: 'gpt-current',
    cwd: 'D:\\Data',
    instructionSources: [],
    reasoningEffort: 'high',
  };
}

function createRuntime(thread = createThread()): CodexAnalysisSessionRuntime {
  const session = { ...createSession(), thread };
  return {
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.144.5',
    model: 'gpt-current',
    reasoningEffort: 'high',
    connection: {
      startThread: vi.fn(async () => session),
      setThreadName: vi.fn(async () => undefined),
      resumeThread: vi.fn(async () => session),
      readThread: vi.fn(async () => thread),
    },
  };
}

function createRegistry(): CodexThreadRegistryV1 {
  return { schemaVersion: 1, activeSessionId: null, sessions: [] };
}

function createUpdater(initial: CodexThreadRegistryV1) {
  let registry = initial;
  const updateRegistry = vi.fn(
    async (update: (current: CodexThreadRegistryV1) => CodexThreadRegistryV1) => {
      registry = update(registry);
      return registry;
    },
  );
  return { updateRegistry, getRegistry: () => registry };
}

function createReadyRegistry(): CodexThreadRegistryV1 {
  const pending = createPendingCodexThreadState({
    localSessionId: 'local-1',
    threadId: 'thread-1',
    generation: 1,
    displayName: 'alice-insight',
    promptHash: PROMPT_HASH,
    model: 'gpt-current',
    reasoningEffort: 'high',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.144.5',
    projectPath: 'D:\\Data',
    instructionSources: [],
    createdAt: '2026-07-19T01:00:00.000Z',
  });
  let registry: CodexThreadRegistryV1 = {
    schemaVersion: 1,
    activeSessionId: null,
    sessions: [pending],
  };
  registry = recordCodexPromptTurn(registry, 'local-1', 'turn-prompt', '2026-07-19T01:01:00.000Z');
  registry = completeCodexPromptTurn(
    registry,
    'local-1',
    'turn-prompt',
    '2026-07-19T01:02:00.000Z',
  );
  registry = prepareCodexAnalysisDelivery(
    registry,
    'local-1',
    {
      deliveryId: 'delivery-1',
      providerKey: `codex:${PROMPT_HASH}`,
      analysisFingerprint: PROMPT_HASH,
      payloadHash: PROMPT_HASH,
      basedOnPartial: false,
      deliveryMode: 'change',
      reasoningEffort: 'high',
    },
    '2026-07-19T01:03:00.000Z',
  );
  registry = recordCodexInitialAnalysisTurn(
    registry,
    'local-1',
    'turn-analysis',
    '2026-07-19T01:04:00.000Z',
  );
  return activateCodexThreadSession(
    registry,
    'local-1',
    'turn-analysis',
    'high',
    '2026-07-19T01:05:00.000Z',
  );
}

describe('prepareCodexAnalysisSession', () => {
  it('should create and persist a recoverable first generation', async () => {
    const registry = createRegistry();
    const updater = createUpdater(registry);
    const runtime = createRuntime();

    const prepared = await prepareCodexAnalysisSession({
      username: 'alice',
      registry,
      runtime,
      projectPath: 'D:\\Data',
      promptHash: PROMPT_HASH,
      updateRegistry: updater.updateRegistry,
      createLocalSessionId: () => 'local-1',
      now: () => new Date('2026-07-19T01:00:00.000Z'),
      platform: 'win32',
    });

    expect(prepared).toMatchObject({
      action: 'sendPrompt',
      source: 'created',
      creationCauses: ['no_ready_session'],
      state: { localSessionId: 'local-1', bootstrapStatus: 'promptPending' },
    });
    expect(updater.getRegistry().sessions).toHaveLength(1);
    expect(runtime.connection.setThreadName).toHaveBeenCalledWith('thread-1', 'alice-insight');
  });

  it('should resume and read a compatible ready session without mutating it', async () => {
    const registry = createReadyRegistry();
    const updater = createUpdater(registry);
    const runtime = createRuntime(
      createThread([
        { id: 'turn-prompt', status: 'completed', error: null, agentMessages: [] },
        { id: 'turn-analysis', status: 'completed', error: null, agentMessages: [] },
      ]),
    );

    const prepared = await prepareCodexAnalysisSession({
      username: 'alice',
      registry,
      runtime,
      projectPath: 'D:\\Data',
      promptHash: PROMPT_HASH,
      updateRegistry: updater.updateRegistry,
      platform: 'win32',
    });

    expect(prepared).toMatchObject({ action: 'ready', source: 'active' });
    expect(runtime.connection.resumeThread).toHaveBeenCalledOnce();
    expect(runtime.connection.readThread).toHaveBeenCalledWith('thread-1');
    expect(updater.updateRegistry).not.toHaveBeenCalled();
  });

  it('should persist recovered prompt completion before returning analysis work', async () => {
    const pending = createPendingCodexThreadState({
      localSessionId: 'local-1',
      threadId: 'thread-1',
      generation: 1,
      displayName: 'alice-insight',
      promptHash: PROMPT_HASH,
      model: 'gpt-current',
      reasoningEffort: 'high',
      executablePath: 'C:\\App\\codex.exe',
      executableVersion: '0.144.5',
      projectPath: 'D:\\Data',
      instructionSources: [],
      createdAt: '2026-07-19T01:00:00.000Z',
    });
    const registry = recordCodexPromptTurn(
      { schemaVersion: 1, activeSessionId: null, sessions: [pending] },
      'local-1',
      'turn-prompt',
      '2026-07-19T01:01:00.000Z',
    );
    const updater = createUpdater(registry);
    const runtime = createRuntime(
      createThread([{ id: 'turn-prompt', status: 'completed', error: null, agentMessages: [] }]),
    );

    const prepared = await prepareCodexAnalysisSession({
      username: 'alice',
      registry,
      runtime,
      projectPath: 'D:\\Data',
      promptHash: PROMPT_HASH,
      updateRegistry: updater.updateRegistry,
      now: () => new Date('2026-07-19T01:02:00.000Z'),
      platform: 'win32',
    });

    expect(prepared).toMatchObject({
      action: 'sendAnalysis',
      source: 'pending',
      state: { bootstrapStatus: 'analysisPending' },
    });
    expect(prepared.registry).toBe(updater.getRegistry());
  });
});
