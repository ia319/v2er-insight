import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodexThreadInfo } from '@/infra/codex';
import { createAIAnalysisResultFixture } from '../../../__tests__/result-fixture';
import type { CodexAnalysisSessionAdvance } from '../session-advance';
import type { PreparedCodexAnalysisSession } from '../session-preparation';
import { createPendingCodexThreadState } from '../thread-registry';
import type {
  CodexPendingAnalysisDelivery,
  CodexThreadRegistryV1,
  CodexThreadState,
} from '../thread-state';

const { mockedAdvance, mockedPrepare } = vi.hoisted(() => ({
  mockedAdvance: vi.fn(),
  mockedPrepare: vi.fn(),
}));

vi.mock('../session-advance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-advance')>()),
  advanceCodexAnalysisSession: mockedAdvance,
}));

vi.mock('../session-preparation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session-preparation')>()),
  prepareCodexAnalysisSession: mockedPrepare,
}));

import { runCodexAnalysis, type RunCodexAnalysisOptions } from '../analysis-run';

const HASH = 'a'.repeat(64);

function createState(overrides: Partial<CodexThreadState> = {}): CodexThreadState {
  return {
    ...createPendingCodexThreadState({
      localSessionId: 'local-1',
      threadId: 'thread-1',
      generation: 1,
      displayName: 'alice-insight',
      promptHash: HASH,
      model: 'gpt-current',
      reasoningEffort: 'high',
      executablePath: 'C:\\App\\codex.exe',
      executableVersion: '0.144.5',
      projectPath: 'D:\\Data',
      instructionSources: [],
      createdAt: '2026-07-19T01:00:00.000Z',
    }),
    ...overrides,
  };
}

function createRegistry(state: CodexThreadState): CodexThreadRegistryV1 {
  return {
    schemaVersion: 1,
    activeSessionId: state.bootstrapStatus === 'ready' ? state.localSessionId : null,
    sessions: [state],
  };
}

function createThread(): CodexThreadInfo {
  return {
    id: 'thread-1',
    name: 'alice-insight',
    cwd: 'D:\\Data',
    status: { type: 'idle' },
    turns: [],
  };
}

function createPrepared(
  action: 'sendPrompt' | 'sendAnalysis' | 'ready',
  state: CodexThreadState,
): PreparedCodexAnalysisSession {
  const registry = createRegistry(state);
  if (action === 'sendPrompt') {
    return {
      action,
      source: 'created',
      creationCauses: ['no_ready_session'],
      registry,
      state,
      thread: createThread(),
    };
  }
  return {
    action,
    source: state.bootstrapStatus === 'ready' ? 'active' : 'pending',
    registry,
    state,
    thread: createThread(),
  };
}

function createOptions(
  registry: CodexThreadRegistryV1,
  updateRegistry = vi.fn(
    async (update: (current: CodexThreadRegistryV1) => CodexThreadRegistryV1) => update(registry),
  ),
): RunCodexAnalysisOptions {
  return {
    username: 'alice',
    registry,
    runtime: {
      executablePath: 'C:\\App\\codex.exe',
      executableVersion: '0.144.5',
      model: 'gpt-current',
      reasoningEffort: 'high',
      connection: {
        startThread: vi.fn(),
        setThreadName: vi.fn(),
        resumeThread: vi.fn(),
        readThread: vi.fn(),
        runTurn: vi.fn(),
      },
    },
    projectPath: 'D:\\Data',
    request: {
      systemPrompt: 'Analyze the JSON.',
      promptHash: HASH,
      payload: '{"schemaVersion":2}',
    },
    analysisFingerprint: HASH,
    payloadHash: HASH,
    basedOnPartial: false,
    deliveryMode: 'change',
    timeoutMs: 60_000,
    canReuseResult: () => false,
    updateRegistry,
    createDeliveryId: () => 'delivery-2',
  };
}

beforeEach(() => {
  mockedAdvance.mockReset();
  mockedPrepare.mockReset();
});

describe('runCodexAnalysis', () => {
  it('should continue from prompt completion to one analysis result', async () => {
    const promptState = createState();
    const promptPrepared = createPrepared('sendPrompt', promptState);
    const analysisState = createState({
      bootstrapStatus: 'analysisPending',
      promptTurnId: 'turn-prompt',
      lastTurnId: 'turn-prompt',
    });
    const analysisRegistry = createRegistry(analysisState);
    const result = createAIAnalysisResultFixture();
    mockedPrepare.mockResolvedValue(promptPrepared);
    mockedAdvance
      .mockResolvedValueOnce({
        action: 'continue',
        reason: 'prompt_completed',
        registry: analysisRegistry,
        state: analysisState,
        thread: createThread(),
      } satisfies CodexAnalysisSessionAdvance)
      .mockResolvedValueOnce({
        action: 'result',
        source: 'sent',
        completion: 'initial',
        registry: analysisRegistry,
        state: analysisState,
        thread: createThread(),
        delivery: {
          deliveryId: 'delivery-2',
          providerKey: 'codex:key',
          analysisFingerprint: HASH,
          payloadHash: HASH,
          basedOnPartial: false,
          deliveryMode: 'change',
          reasoningEffort: 'high',
        },
        turn: { id: 'turn-analysis', status: 'completed', error: null, agentMessages: [] },
        message: { id: 'message-1', text: JSON.stringify(result), phase: 'final_answer' },
        result,
      } satisfies CodexAnalysisSessionAdvance);

    const output = await runCodexAnalysis(createOptions(createRegistry(promptState)));

    expect(output).toMatchObject({ status: 'result', model: 'gpt-current' });
    expect(mockedAdvance).toHaveBeenCalledTimes(2);
    expect(mockedAdvance.mock.calls[1]?.[0]).toMatchObject({
      prepared: { action: 'sendAnalysis', source: 'pending' },
    });
  });

  it('should skip an idle ready session with a reusable result', async () => {
    const state = createState({
      bootstrapStatus: 'ready',
      promptTurnId: 'turn-prompt',
      initialAnalysisTurnId: 'turn-analysis',
      lastTurnId: 'turn-analysis',
    });
    mockedPrepare.mockResolvedValue(createPrepared('ready', state));
    const options = createOptions(createRegistry(state));
    options.canReuseResult = () => true;

    await expect(runCodexAnalysis(options)).resolves.toMatchObject({ status: 'skipped' });
    expect(mockedAdvance).not.toHaveBeenCalled();
  });

  it('should cancel a superseded unaccepted update before skipping', async () => {
    const pendingAnalysis: CodexPendingAnalysisDelivery = {
      deliveryId: 'delivery-1',
      providerKey: 'codex:old',
      analysisFingerprint: 'b'.repeat(64),
      payloadHash: 'b'.repeat(64),
      basedOnPartial: false,
      deliveryMode: 'change',
      reasoningEffort: 'high',
      turnId: null,
    };
    const state = createState({
      bootstrapStatus: 'ready',
      promptTurnId: 'turn-prompt',
      initialAnalysisTurnId: 'turn-analysis',
      lastTurnId: 'turn-analysis',
      pendingAnalysis,
    });
    let registry = createRegistry(state);
    const updateRegistry = vi.fn(
      async (update: (current: CodexThreadRegistryV1) => CodexThreadRegistryV1) => {
        registry = update(registry);
        return registry;
      },
    );
    mockedPrepare.mockResolvedValue(createPrepared('sendAnalysis', state));
    const options = createOptions(registry, updateRegistry);
    options.canReuseResult = () => true;

    const output = await runCodexAnalysis(options);

    expect(output).toMatchObject({ status: 'skipped', state: { pendingAnalysis: undefined } });
    expect(updateRegistry).toHaveBeenCalledOnce();
    expect(mockedAdvance).not.toHaveBeenCalled();
  });

  it('should expose a busy recovered turn without advancing it', async () => {
    const state = createState();
    const registry = createRegistry(state);
    mockedPrepare.mockResolvedValue({
      action: 'busy',
      source: 'pending',
      registry,
      state,
      thread: { ...createThread(), status: { type: 'active', activeFlags: [] } },
      turnId: 'turn-1',
    } satisfies PreparedCodexAnalysisSession);
    mockedAdvance.mockResolvedValue({
      action: 'busy',
      registry,
      state,
      thread: createThread(),
      turnId: 'turn-1',
    } satisfies CodexAnalysisSessionAdvance);

    await expect(runCodexAnalysis(createOptions(registry))).resolves.toMatchObject({
      status: 'busy',
      turnId: 'turn-1',
    });
    expect(mockedAdvance).toHaveBeenCalledOnce();
  });
});
