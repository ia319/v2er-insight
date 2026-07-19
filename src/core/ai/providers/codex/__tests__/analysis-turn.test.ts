import { describe, expect, it, vi } from 'vitest';
import type { CodexTurnInfo } from '@/infra/codex';
import { AI_ANALYSIS_RESULT_JSON_SCHEMA } from '../../../result-schema';
import { createAIAnalysisResultFixture } from '../../../__tests__/result-fixture';
import {
  activateCodexThreadSession,
  completeCodexPromptTurn,
  createPendingCodexThreadState,
  recordCodexInitialAnalysisTurn,
} from '../thread-registry';
import type { CodexThreadRegistryV1 } from '../thread-state';
import {
  activateCodexInitialAnalysisTurn,
  completeCodexAnalysisUpdateTurn,
  sendCodexAnalysisUpdateTurn,
  sendCodexInitialAnalysisTurn,
  type SendCodexAnalysisUpdateTurnOptions,
  type SendCodexInitialAnalysisTurnOptions,
} from '../analysis-turn';

function createFixture(turnId = 'turn-analysis') {
  const pending = createPendingCodexThreadState({
    localSessionId: 'local-1',
    threadId: 'thread-1',
    generation: 1,
    displayName: 'alice-insight',
    promptHash: 'a'.repeat(64),
    model: 'gpt-current',
    reasoningEffort: 'high',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.144.5',
    projectPath: 'D:\\Data',
    instructionSources: [],
    createdAt: '2026-07-19T01:00:00.000Z',
  });
  let registry = completeCodexPromptTurn(
    {
      schemaVersion: 1,
      activeSessionId: null,
      sessions: [{ ...pending, promptTurnId: 'turn-prompt', lastTurnId: 'turn-prompt' }],
    },
    pending.localSessionId,
    'turn-prompt',
    '2026-07-19T01:01:00.000Z',
  );
  const state = registry.sessions[0];
  if (!state) throw new Error('Missing analysis-pending fixture');

  const started: CodexTurnInfo = {
    id: turnId,
    status: 'inProgress',
    error: null,
    agentMessages: [],
  };
  const expectedResult = createAIAnalysisResultFixture();
  const completed: CodexTurnInfo = {
    ...started,
    status: 'completed',
    agentMessages: [
      { id: 'commentary', text: 'working', phase: 'commentary' },
      { id: 'final', text: JSON.stringify(expectedResult), phase: 'final_answer' },
    ],
  };
  const connection = {
    runTurn: vi.fn(
      async (
        _turnOptions: Parameters<SendCodexInitialAnalysisTurnOptions['connection']['runTurn']>[0],
        _timeoutMs: number,
        onStarted?: Parameters<SendCodexInitialAnalysisTurnOptions['connection']['runTurn']>[2],
      ) => {
        await onStarted?.(started);
        return completed;
      },
    ),
  };
  const updateRegistry = vi.fn(
    async (update: (current: CodexThreadRegistryV1) => CodexThreadRegistryV1) => {
      registry = update(registry);
      return registry;
    },
  );
  const times = [new Date('2026-07-19T01:02:00.000Z'), new Date('2026-07-19T01:03:00.000Z')];
  const options: SendCodexInitialAnalysisTurnOptions = {
    state,
    payload: '{"schemaVersion":2}',
    deliveryId: 'delivery-1',
    reasoningEffort: 'high',
    timeoutMs: 60_000,
    connection,
    updateRegistry,
    now: () => {
      const next = times.shift();
      if (!next) throw new Error('Unexpected clock read');
      return next;
    },
  };
  return {
    state,
    started,
    completed,
    expectedResult,
    connection,
    updateRegistry,
    options,
    getRegistry: () => registry,
  };
}

function createReadyRegistry(): CodexThreadRegistryV1 {
  const fixture = createFixture();
  let registry = recordCodexInitialAnalysisTurn(
    fixture.getRegistry(),
    'local-1',
    'turn-initial',
    '2026-07-19T01:02:00.000Z',
  );
  registry = activateCodexThreadSession(
    registry,
    'local-1',
    'turn-initial',
    'high',
    '2026-07-19T01:03:00.000Z',
  );
  return registry;
}

describe('sendCodexInitialAnalysisTurn', () => {
  it('should parse one structured payload before explicit activation', async () => {
    const fixture = createFixture();
    const result = await sendCodexInitialAnalysisTurn(fixture.options);

    expect(fixture.connection.runTurn).toHaveBeenCalledWith(
      {
        threadId: 'thread-1',
        text: '{"schemaVersion":2}',
        cwd: 'D:\\Data',
        model: 'gpt-current',
        effort: 'high',
        clientUserMessageId: 'delivery-1',
        outputSchema: AI_ANALYSIS_RESULT_JSON_SCHEMA,
      },
      60_000,
      expect.any(Function),
    );
    expect(result.result).toEqual(fixture.expectedResult);
    expect(result.message.id).toBe('final');
    expect(result.registry).toMatchObject({ activeSessionId: null });
    expect(result.registry.sessions[0]).toMatchObject({
      bootstrapStatus: 'analysisPending',
      initialAnalysisTurnId: 'turn-analysis',
      lastTurnId: 'turn-analysis',
      lastUsedAt: '2026-07-19T01:02:00.000Z',
    });

    const activated = await activateCodexInitialAnalysisTurn({
      localSessionId: 'local-1',
      turnId: 'turn-analysis',
      reasoningEffort: 'high',
      updateRegistry: fixture.options.updateRegistry,
      now: fixture.options.now,
    });
    expect(activated).toMatchObject({ activeSessionId: 'local-1' });
    expect(activated.sessions[0]).toMatchObject({
      bootstrapStatus: 'ready',
      lastReasoningEffort: 'high',
      lastUsedAt: '2026-07-19T01:03:00.000Z',
    });
  });

  it('should retain the accepted turn when the final result is invalid', async () => {
    const fixture = createFixture();
    fixture.connection.runTurn.mockImplementation(async (_turnOptions, _timeoutMs, onStarted) => {
      await onStarted?.(fixture.started);
      return {
        ...fixture.completed,
        agentMessages: [{ id: 'final', text: '{"summary":"incomplete"}', phase: 'final_answer' }],
      };
    });

    await expect(sendCodexInitialAnalysisTurn(fixture.options)).rejects.toMatchObject({
      code: 'invalid_result',
    });
    expect(fixture.updateRegistry).toHaveBeenCalledOnce();
    expect(fixture.getRegistry().sessions[0]).toMatchObject({
      bootstrapStatus: 'analysisPending',
      initialAnalysisTurnId: 'turn-analysis',
      lastTurnId: 'turn-analysis',
    });
  });

  it('should reject an analysis turn that already has an external ID', async () => {
    const fixture = createFixture();
    const state = {
      ...fixture.state,
      initialAnalysisTurnId: 'existing-turn',
      lastTurnId: 'existing-turn',
    };

    await expect(sendCodexInitialAnalysisTurn({ ...fixture.options, state })).rejects.toMatchObject(
      { code: 'turn_already_started' },
    );
    expect(fixture.connection.runTurn).not.toHaveBeenCalled();
  });

  it('should reject an invalid delivery ID before sending', async () => {
    const fixture = createFixture();

    await expect(
      sendCodexInitialAnalysisTurn({ ...fixture.options, deliveryId: '  ' }),
    ).rejects.toMatchObject({ code: 'delivery_id_invalid' });
    expect(fixture.connection.runTurn).not.toHaveBeenCalled();
  });

  it('should reject an acceptance transition that was not persisted', async () => {
    const fixture = createFixture();
    const initial = fixture.getRegistry();

    await expect(
      sendCodexInitialAnalysisTurn({
        ...fixture.options,
        updateRegistry: async () => initial,
      }),
    ).rejects.toMatchObject({ code: 'acceptance_not_persisted' });
  });

  it('should reject an activation transition that was not persisted', async () => {
    const fixture = createFixture();
    const result = await sendCodexInitialAnalysisTurn(fixture.options);

    await expect(
      activateCodexInitialAnalysisTurn({
        localSessionId: 'local-1',
        turnId: result.turn.id,
        reasoningEffort: 'high',
        updateRegistry: async () => result.registry,
        now: fixture.options.now,
      }),
    ).rejects.toMatchObject({ code: 'activation_not_persisted' });
  });
});

describe('sendCodexAnalysisUpdateTurn', () => {
  function createUpdateFixture() {
    let registry = createReadyRegistry();
    const state = registry.sessions[0];
    if (!state) throw new Error('Missing ready session fixture');
    const fixture = createFixture('turn-update');
    const updateRegistry = vi.fn(
      async (update: (current: CodexThreadRegistryV1) => CodexThreadRegistryV1) => {
        registry = update(registry);
        return registry;
      },
    );
    const times = [new Date('2026-07-19T01:04:00.000Z'), new Date('2026-07-19T01:05:00.000Z')];
    const options: SendCodexAnalysisUpdateTurnOptions = {
      registry,
      state,
      payload: '{"schemaVersion":2,"update":true}',
      deliveryId: 'delivery-2',
      reasoningEffort: 'low',
      timeoutMs: 60_000,
      connection: fixture.connection,
      updateRegistry,
      now: () => {
        const next = times.shift();
        if (!next) throw new Error('Unexpected update clock read');
        return next;
      },
    };
    return { fixture, options, updateRegistry, getRegistry: () => registry };
  }

  it('should record a ready update before parsing and complete it after caller persistence', async () => {
    const fixture = createUpdateFixture();
    const result = await sendCodexAnalysisUpdateTurn(fixture.options);

    expect(result.result).toEqual(fixture.fixture.expectedResult);
    expect(result.registry).toMatchObject({ activeSessionId: 'local-1' });
    expect(result.registry.sessions[0]).toMatchObject({
      bootstrapStatus: 'ready',
      lastTurnId: 'turn-update',
      lastReasoningEffort: 'high',
      lastUsedAt: '2026-07-19T01:04:00.000Z',
    });

    const completed = await completeCodexAnalysisUpdateTurn({
      localSessionId: 'local-1',
      turnId: result.turn.id,
      reasoningEffort: 'low',
      updateRegistry: fixture.options.updateRegistry,
      now: fixture.options.now,
    });
    expect(completed.sessions[0]).toMatchObject({
      lastTurnId: 'turn-update',
      lastReasoningEffort: 'low',
      lastUsedAt: '2026-07-19T01:05:00.000Z',
    });
  });

  it('should reject a ready session that is not active before sending', async () => {
    const fixture = createUpdateFixture();
    const current = fixture.options.state;
    const other = {
      ...current,
      localSessionId: 'local-2',
      threadId: 'thread-2',
      generation: 2,
      displayName: 'alice-insight-2',
    };
    const registry: CodexThreadRegistryV1 = {
      schemaVersion: 1,
      activeSessionId: other.localSessionId,
      sessions: [current, other],
    };

    await expect(
      sendCodexAnalysisUpdateTurn({ ...fixture.options, registry }),
    ).rejects.toMatchObject({ code: 'session_not_active' });
    expect(fixture.fixture.connection.runTurn).not.toHaveBeenCalled();
  });

  it('should reject update completion that was not persisted', async () => {
    const fixture = createUpdateFixture();
    const result = await sendCodexAnalysisUpdateTurn(fixture.options);

    await expect(
      completeCodexAnalysisUpdateTurn({
        localSessionId: 'local-1',
        turnId: result.turn.id,
        reasoningEffort: 'low',
        updateRegistry: async () => result.registry,
        now: fixture.options.now,
      }),
    ).rejects.toMatchObject({ code: 'completion_not_persisted' });
  });
});
