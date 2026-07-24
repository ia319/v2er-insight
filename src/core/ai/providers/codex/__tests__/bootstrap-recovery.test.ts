import { describe, expect, it, vi } from 'vitest';
import type { CodexThreadInfo, CodexTurnInfo } from '@/infra/codex';
import { createAIAnalysisResultFixture } from '../../../__tests__/result-fixture';
import {
  activateCodexThreadSession,
  completeCodexPromptTurn,
  createPendingCodexThreadState,
  prepareCodexAnalysisDelivery,
  recordCodexInitialAnalysisTurn,
  recordCodexPromptTurn,
  recordCodexThreadTurnStart,
} from '../thread-registry';
import type { CodexThreadRegistryV1, CodexThreadState } from '../thread-state';
import { recoverCodexBootstrap } from '../bootstrap-recovery';

const HASH = 'a'.repeat(64);

const DELIVERY = {
  deliveryId: 'delivery-1',
  providerKey: `codex:${HASH}`,
  analysisFingerprint: HASH,
  payloadHash: HASH,
  basedOnPartial: false,
  deliveryMode: 'change' as const,
  reasoningEffort: 'high',
};

const UPDATE_DELIVERY = {
  ...DELIVERY,
  deliveryId: 'delivery-2',
  reasoningEffort: 'low',
};

function createPendingRegistry(): CodexThreadRegistryV1 {
  return {
    schemaVersion: 1,
    activeSessionId: null,
    sessions: [
      createPendingCodexThreadState({
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
    ],
  };
}

function getState(registry: CodexThreadRegistryV1): CodexThreadState {
  const state = registry.sessions[0];
  if (!state) throw new Error('Missing Codex state fixture');
  return state;
}

function createTurn(status: CodexTurnInfo['status'], id = 'turn-prompt'): CodexTurnInfo {
  return { id, status, error: null, agentMessages: [] };
}

function createThread(
  turns: CodexTurnInfo[] = [],
  status: CodexThreadInfo['status'] = { type: 'idle' },
): CodexThreadInfo {
  return { id: 'thread-1', name: 'alice-insight', cwd: 'D:\\Data', status, turns };
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
  let registry = createPendingRegistry();
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
    DELIVERY,
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

function createReadyThread(extraTurns: CodexTurnInfo[] = []): CodexThreadInfo {
  return createThread([
    createTurn('completed'),
    createTurn('completed', 'turn-analysis'),
    ...extraTurns,
  ]);
}

describe('recoverCodexBootstrap', () => {
  it('should continue with a prompt when no prompt turn was accepted', async () => {
    const registry = createPendingRegistry();
    const updater = createUpdater(registry);
    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createThread(),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).resolves.toMatchObject({ action: 'sendPrompt' });
  });

  it('should report a running persisted turn as busy', async () => {
    let registry = createPendingRegistry();
    registry = recordCodexPromptTurn(
      registry,
      'local-1',
      'turn-prompt',
      '2026-07-19T01:01:00.000Z',
    );
    const updater = createUpdater(registry);
    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createThread([createTurn('inProgress')]),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).resolves.toMatchObject({ action: 'busy', turnId: 'turn-prompt' });
    expect(updater.updateRegistry).not.toHaveBeenCalled();
  });

  it('should persist a completed prompt before continuing with analysis', async () => {
    let registry = createPendingRegistry();
    registry = recordCodexPromptTurn(
      registry,
      'local-1',
      'turn-prompt',
      '2026-07-19T01:01:00.000Z',
    );
    const updater = createUpdater(registry);
    const recovery = await recoverCodexBootstrap({
      state: getState(registry),
      thread: createThread([createTurn('completed')]),
      updateRegistry: updater.updateRegistry,
      now: () => new Date('2026-07-19T01:02:00.000Z'),
      platform: 'win32',
    });

    expect(recovery).toMatchObject({ action: 'sendAnalysis' });
    expect(recovery.state).toMatchObject({ bootstrapStatus: 'analysisPending' });
    expect(updater.updateRegistry).toHaveBeenCalledOnce();
  });

  it('should recover and strictly parse a completed analysis result', async () => {
    let registry = createPendingRegistry();
    registry = recordCodexPromptTurn(
      registry,
      'local-1',
      'turn-prompt',
      '2026-07-19T01:01:00.000Z',
    );
    registry = completeCodexPromptTurn(
      registry,
      'local-1',
      'turn-prompt',
      '2026-07-19T01:02:00.000Z',
    );
    registry = prepareCodexAnalysisDelivery(
      registry,
      'local-1',
      DELIVERY,
      '2026-07-19T01:02:30.000Z',
    );
    registry = recordCodexInitialAnalysisTurn(
      registry,
      'local-1',
      'turn-analysis',
      '2026-07-19T01:03:00.000Z',
    );
    const result = createAIAnalysisResultFixture();
    const analysisTurn: CodexTurnInfo = {
      id: 'turn-analysis',
      status: 'completed',
      error: null,
      agentMessages: [{ id: 'final', text: JSON.stringify(result), phase: 'final_answer' }],
    };
    const updater = createUpdater(registry);

    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createThread([createTurn('completed'), analysisTurn]),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).resolves.toMatchObject({
      action: 'analysisResult',
      result,
      delivery: { ...DELIVERY, turnId: 'turn-analysis' },
    });
    expect(updater.updateRegistry).not.toHaveBeenCalled();
  });

  it('should reject an analysis stage whose prompt turn is missing', async () => {
    let registry = createPendingRegistry();
    registry = recordCodexPromptTurn(
      registry,
      'local-1',
      'turn-prompt',
      '2026-07-19T01:01:00.000Z',
    );
    registry = completeCodexPromptTurn(
      registry,
      'local-1',
      'turn-prompt',
      '2026-07-19T01:02:00.000Z',
    );
    const updater = createUpdater(registry);

    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createThread(),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).rejects.toMatchObject({ code: 'turn_not_found' });
  });

  it('should preserve a terminal failure without resending', async () => {
    let registry = createPendingRegistry();
    registry = recordCodexPromptTurn(
      registry,
      'local-1',
      'turn-prompt',
      '2026-07-19T01:01:00.000Z',
    );
    const failed = createTurn('failed');
    failed.error = { message: 'request failed', additionalDetails: null };
    const updater = createUpdater(registry);

    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createThread([failed]),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).rejects.toMatchObject({ code: 'turn_failed' });
    expect(updater.updateRegistry).not.toHaveBeenCalled();
  });

  it('should report an active App thread as busy before sending', async () => {
    const registry = createPendingRegistry();
    const updater = createUpdater(registry);

    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createThread([], { type: 'active', activeFlags: [] }),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).resolves.toMatchObject({ action: 'busy', turnId: null });
  });

  it('should continue a prepared ready-session attempt when no turn was accepted', async () => {
    const registry = prepareCodexAnalysisDelivery(
      createReadyRegistry(),
      'local-1',
      UPDATE_DELIVERY,
      '2026-07-19T01:06:00.000Z',
    );
    const updater = createUpdater(registry);

    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createReadyThread(),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).resolves.toMatchObject({ action: 'sendAnalysis' });
  });

  it('should preserve an idle ready session without a pending delivery', async () => {
    const registry = createReadyRegistry();
    const updater = createUpdater(registry);

    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createReadyThread([createTurn('completed', 'app-turn')]),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).resolves.toMatchObject({ action: 'ready' });
  });

  it('should recover a completed ready-session analysis by its pending turn', async () => {
    let registry = prepareCodexAnalysisDelivery(
      createReadyRegistry(),
      'local-1',
      UPDATE_DELIVERY,
      '2026-07-19T01:06:00.000Z',
    );
    registry = recordCodexThreadTurnStart(
      registry,
      'local-1',
      'turn-update',
      '2026-07-19T01:07:00.000Z',
    );
    const result = createAIAnalysisResultFixture();
    const updateTurn: CodexTurnInfo = {
      id: 'turn-update',
      status: 'completed',
      error: null,
      agentMessages: [{ id: 'final', text: JSON.stringify(result), phase: 'final_answer' }],
    };
    const updater = createUpdater(registry);

    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createReadyThread([updateTurn]),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).resolves.toMatchObject({
      action: 'analysisResult',
      result,
      delivery: { ...UPDATE_DELIVERY, turnId: 'turn-update' },
    });
  });

  it('should keep an accepted ready-session analysis in progress', async () => {
    let registry = prepareCodexAnalysisDelivery(
      createReadyRegistry(),
      'local-1',
      UPDATE_DELIVERY,
      '2026-07-19T01:06:00.000Z',
    );
    registry = recordCodexThreadTurnStart(
      registry,
      'local-1',
      'turn-update',
      '2026-07-19T01:07:00.000Z',
    );
    const updater = createUpdater(registry);

    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createReadyThread([createTurn('inProgress', 'turn-update')]),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).resolves.toMatchObject({ action: 'busy', turnId: 'turn-update' });
  });

  it('should reject an untracked turn after an unaccepted ready-session attempt', async () => {
    const registry = prepareCodexAnalysisDelivery(
      createReadyRegistry(),
      'local-1',
      UPDATE_DELIVERY,
      '2026-07-19T01:06:00.000Z',
    );
    const updater = createUpdater(registry);

    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createReadyThread([createTurn('completed', 'unknown-turn')]),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).rejects.toMatchObject({ code: 'untracked_turns' });
  });

  it('should reject an untracked turn instead of resending a missing local stage', async () => {
    const registry = createPendingRegistry();
    const updater = createUpdater(registry);

    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createThread([createTurn('completed', 'untracked-turn')]),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).rejects.toMatchObject({ code: 'untracked_turns' });
    expect(updater.updateRegistry).not.toHaveBeenCalled();
  });

  it('should reject missing turns and mismatched thread identity', async () => {
    let registry = createPendingRegistry();
    registry = recordCodexPromptTurn(
      registry,
      'local-1',
      'turn-prompt',
      '2026-07-19T01:01:00.000Z',
    );
    const updater = createUpdater(registry);
    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: createThread(),
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).rejects.toMatchObject({ code: 'turn_not_found' });

    await expect(
      recoverCodexBootstrap({
        state: getState(registry),
        thread: { ...createThread(), id: 'other-thread' },
        updateRegistry: updater.updateRegistry,
        platform: 'win32',
      }),
    ).rejects.toMatchObject({ code: 'thread_mismatch' });
  });
});
