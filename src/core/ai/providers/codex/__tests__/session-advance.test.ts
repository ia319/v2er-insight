import { describe, expect, it, vi } from 'vitest';
import type { CodexThreadInfo, CodexTurnInfo } from '@/infra/codex';
import { createAIAnalysisResultFixture } from '../../../__tests__/result-fixture';
import type { CodexAnalysisDeliveryTarget } from '../analysis-delivery';
import type { CodexRuntimeConnection } from '../runtime-selection';
import type { PreparedCodexAnalysisSession } from '../session-preparation';
import { advanceCodexAnalysisSession } from '../session-advance';
import {
  createPendingCodexThreadState,
  prepareCodexAnalysisDelivery,
  recordCodexInitialAnalysisTurn,
} from '../thread-registry';
import type {
  CodexPendingAnalysisDelivery,
  CodexThreadRegistryV1,
  CodexThreadState,
  PrepareCodexAnalysisDeliveryInput,
} from '../thread-state';

const HASH = 'a'.repeat(64);
const NEXT_HASH = 'b'.repeat(64);

const DELIVERY_INPUT: PrepareCodexAnalysisDeliveryInput = {
  deliveryId: 'delivery-1',
  providerKey: `codex:${HASH}`,
  analysisFingerprint: HASH,
  payloadHash: HASH,
  basedOnPartial: false,
  deliveryMode: 'change',
  reasoningEffort: 'high',
};

const DELIVERY: CodexPendingAnalysisDelivery = {
  ...DELIVERY_INPUT,
  turnId: 'turn-analysis',
};

const TARGET = {
  providerKey: `codex:${NEXT_HASH}`,
  analysisFingerprint: NEXT_HASH,
  payloadHash: NEXT_HASH,
  basedOnPartial: false,
  deliveryMode: 'change',
  reasoningEffort: 'high',
} satisfies CodexAnalysisDeliveryTarget;

const APPLICABLE_TARGET = {
  providerKey: DELIVERY_INPUT.providerKey,
  analysisFingerprint: DELIVERY_INPUT.analysisFingerprint,
  payloadHash: DELIVERY_INPUT.payloadHash,
  basedOnPartial: DELIVERY_INPUT.basedOnPartial,
  deliveryMode: 'resend',
  reasoningEffort: DELIVERY_INPUT.reasoningEffort,
} satisfies CodexAnalysisDeliveryTarget;

function createPendingState(): CodexThreadState {
  return createPendingCodexThreadState({
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
  });
}

function createThread(turns: CodexTurnInfo[] = []): CodexThreadInfo {
  return {
    id: 'thread-1',
    name: 'alice-insight',
    cwd: 'D:\\Data',
    status: { type: 'idle' },
    turns,
  };
}

function createRegistry(state: CodexThreadState): CodexThreadRegistryV1 {
  return {
    schemaVersion: 1,
    activeSessionId: state.bootstrapStatus === 'ready' ? state.localSessionId : null,
    sessions: [state],
  };
}

function getState(registry: CodexThreadRegistryV1): CodexThreadState {
  const state = registry.sessions[0];
  if (!state) throw new Error('Missing test session');
  return state;
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

function createClock(): () => Date {
  let seconds = 10;
  return () => new Date(`2026-07-19T01:00:${String(seconds++).padStart(2, '0')}.000Z`);
}

function createCompletedTurn(id: string, result = createAIAnalysisResultFixture()): CodexTurnInfo {
  return {
    id,
    status: 'completed',
    error: null,
    agentMessages: [{ id: `message-${id}`, text: JSON.stringify(result), phase: 'final_answer' }],
  };
}

describe('advanceCodexAnalysisSession', () => {
  it('should preserve a busy recovery state without sending', async () => {
    const state = createPendingState();
    const registry = createRegistry(state);
    const updateRegistry = vi.fn();
    const runTurn = vi.fn();

    const advanced = await advanceCodexAnalysisSession({
      prepared: {
        action: 'busy',
        source: 'pending',
        registry,
        state,
        thread: { ...createThread(), status: { type: 'active', activeFlags: [] } },
        turnId: null,
      },
      target: TARGET,
      systemPrompt: 'prompt',
      payload: '{}',
      timeoutMs: 60_000,
      connection: { runTurn },
      updateRegistry,
    });

    expect(advanced).toMatchObject({ action: 'busy', turnId: null });
    expect(runTurn).not.toHaveBeenCalled();
    expect(updateRegistry).not.toHaveBeenCalled();
  });

  it('should send only the prompt turn before returning continuation', async () => {
    const state = createPendingState();
    const registry = createRegistry(state);
    const updater = createUpdater(registry);
    const runTurn: Pick<CodexRuntimeConnection, 'runTurn'>['runTurn'] = async (
      request,
      _timeoutMs,
      onStarted,
    ) => {
      const turn: CodexTurnInfo = {
        id: 'turn-prompt',
        status: 'inProgress',
        error: null,
        agentMessages: [],
      };
      await onStarted?.(turn);
      return { ...turn, status: 'completed' };
    };
    const prepared: PreparedCodexAnalysisSession = {
      action: 'sendPrompt',
      source: 'created',
      creationCauses: ['no_ready_session'],
      registry,
      state,
      thread: createThread(),
    };

    const advanced = await advanceCodexAnalysisSession({
      prepared,
      target: TARGET,
      systemPrompt: 'Analyze the supplied JSON.',
      payload: '{"schemaVersion":2}',
      timeoutMs: 60_000,
      connection: { runTurn: vi.fn(runTurn) },
      updateRegistry: updater.updateRegistry,
      now: createClock(),
    });

    expect(advanced).toMatchObject({
      action: 'continue',
      reason: 'prompt_completed',
      state: { bootstrapStatus: 'analysisPending', promptTurnId: 'turn-prompt' },
    });
    expect(updater.updateRegistry).toHaveBeenCalledTimes(2);
  });

  it('should return an applicable recovered result without changing the registry', async () => {
    const result = createAIAnalysisResultFixture();
    const state: CodexThreadState = {
      ...createPendingState(),
      bootstrapStatus: 'analysisPending',
      promptTurnId: 'turn-prompt',
      initialAnalysisTurnId: 'turn-analysis',
      lastTurnId: 'turn-analysis',
      pendingAnalysis: DELIVERY,
    };
    const registry = createRegistry(state);
    const updater = createUpdater(registry);
    const turn = createCompletedTurn('turn-analysis', result);
    const prepared: PreparedCodexAnalysisSession = {
      action: 'analysisResult',
      source: 'pending',
      registry,
      state,
      thread: createThread([turn]),
      turn,
      message: turn.agentMessages[0]!,
      result,
      delivery: DELIVERY,
    };

    const advanced = await advanceCodexAnalysisSession({
      prepared,
      target: APPLICABLE_TARGET,
      systemPrompt: 'prompt',
      payload: '{}',
      timeoutMs: 60_000,
      connection: { runTurn: vi.fn() },
      updateRegistry: updater.updateRegistry,
    });

    expect(advanced).toMatchObject({
      action: 'result',
      source: 'recovered',
      completion: 'initial',
      delivery: DELIVERY,
    });
    expect(updater.updateRegistry).not.toHaveBeenCalled();
  });

  it('should settle a superseded recovered result before continuing', async () => {
    let registry = createRegistry({
      ...createPendingState(),
      bootstrapStatus: 'analysisPending',
      promptTurnId: 'turn-prompt',
      initialAnalysisTurnId: null,
      lastTurnId: 'turn-prompt',
    });
    registry = prepareCodexAnalysisDelivery(
      registry,
      'local-1',
      DELIVERY_INPUT,
      '2026-07-19T01:00:01.000Z',
    );
    registry = recordCodexInitialAnalysisTurn(
      registry,
      'local-1',
      'turn-analysis',
      '2026-07-19T01:00:02.000Z',
    );
    const state = getState(registry);
    const updater = createUpdater(registry);
    const turn = createCompletedTurn('turn-analysis');
    const prepared: PreparedCodexAnalysisSession = {
      action: 'analysisResult',
      source: 'pending',
      registry,
      state,
      thread: createThread([turn]),
      turn,
      message: turn.agentMessages[0]!,
      result: createAIAnalysisResultFixture(),
      delivery: DELIVERY,
    };

    const advanced = await advanceCodexAnalysisSession({
      prepared,
      target: TARGET,
      systemPrompt: 'prompt',
      payload: '{}',
      timeoutMs: 60_000,
      connection: { runTurn: vi.fn() },
      updateRegistry: updater.updateRegistry,
      now: createClock(),
    });

    expect(advanced).toMatchObject({
      action: 'continue',
      reason: 'superseded_result',
      state: { bootstrapStatus: 'ready', pendingAnalysis: undefined },
    });
    expect(updater.getRegistry().activeSessionId).toBe('local-1');
  });

  it('should replace an unaccepted update before sending the current payload', async () => {
    const oldPending = { ...DELIVERY, turnId: null, payloadHash: HASH };
    const state: CodexThreadState = {
      ...createPendingState(),
      bootstrapStatus: 'ready',
      promptTurnId: 'turn-prompt',
      initialAnalysisTurnId: 'turn-initial',
      lastTurnId: 'turn-initial',
      pendingAnalysis: oldPending,
    };
    const registry = createRegistry(state);
    const updater = createUpdater(registry);
    const completed = createCompletedTurn('turn-update');
    const runTurn: Pick<CodexRuntimeConnection, 'runTurn'>['runTurn'] = async (
      request,
      _timeoutMs,
      onStarted,
    ) => {
      expect(request.clientUserMessageId).toBe('delivery-2');
      expect(request.text).toBe('{"schemaVersion":2}');
      await onStarted?.({ ...completed, status: 'inProgress', agentMessages: [] });
      return completed;
    };
    const prepared: PreparedCodexAnalysisSession = {
      action: 'sendAnalysis',
      source: 'active',
      registry,
      state,
      thread: createThread([createCompletedTurn('turn-initial')]),
    };

    const advanced = await advanceCodexAnalysisSession({
      prepared,
      target: TARGET,
      systemPrompt: 'prompt',
      payload: '{"schemaVersion":2}',
      timeoutMs: 60_000,
      connection: { runTurn: vi.fn(runTurn) },
      updateRegistry: updater.updateRegistry,
      createDeliveryId: () => 'delivery-2',
      now: createClock(),
    });

    expect(advanced).toMatchObject({
      action: 'result',
      source: 'sent',
      completion: 'update',
      delivery: { deliveryId: 'delivery-2', payloadHash: NEXT_HASH },
      state: { lastTurnId: 'turn-update', pendingAnalysis: { turnId: 'turn-update' } },
    });
  });
});
