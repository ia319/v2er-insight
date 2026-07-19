import { describe, expect, it, vi } from 'vitest';
import type { CodexTurnInfo } from '@/infra/codex';
import { AI_ANALYSIS_RESULT_JSON_SCHEMA } from '../../../result-schema';
import { createAIAnalysisResultFixture } from '../../../__tests__/result-fixture';
import { createPendingCodexThreadState, completeCodexPromptTurn } from '../thread-registry';
import type { CodexThreadRegistryV1 } from '../thread-state';
import {
  activateCodexInitialAnalysisTurn,
  sendCodexInitialAnalysisTurn,
  type SendCodexInitialAnalysisTurnOptions,
} from '../analysis-turn';

function createFixture() {
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
    id: 'turn-analysis',
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
