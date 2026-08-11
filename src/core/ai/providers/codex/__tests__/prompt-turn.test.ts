import { describe, expect, it, vi } from 'vitest';
import type { CodexTurnInfo } from '@/infra/codex';
import { createPendingCodexThreadState } from '../thread-registry';
import type { CodexThreadRegistryV1 } from '../thread-state';
import {
  CodexPromptTurnError,
  sendCodexPromptTurn,
  type SendCodexPromptTurnOptions,
} from '../prompt-turn';

function createFixture() {
  const state = createPendingCodexThreadState({
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
  let registry: CodexThreadRegistryV1 = {
    schemaVersion: 1,
    activeSessionId: null,
    sessions: [state],
  };
  const started: CodexTurnInfo = {
    id: 'turn-prompt',
    status: 'inProgress',
    error: null,
    agentMessages: [],
  };
  const completed: CodexTurnInfo = {
    ...started,
    status: 'completed',
    agentMessages: [{ id: 'reply', text: 'acknowledged', phase: 'final_answer' }],
  };
  const connection = {
    runTurn: vi.fn(
      async (
        _turnOptions: Parameters<SendCodexPromptTurnOptions['connection']['runTurn']>[0],
        _timeoutMs: number,
        onStarted?: Parameters<SendCodexPromptTurnOptions['connection']['runTurn']>[2],
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
  const times = [new Date('2026-07-19T01:01:00.000Z'), new Date('2026-07-19T01:02:00.000Z')];
  const options: SendCodexPromptTurnOptions = {
    state,
    text: 'analysis instructions',
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
    connection,
    updateRegistry,
    options,
    getRegistry: () => registry,
  };
}

describe('sendCodexPromptTurn', () => {
  it('should record acceptance before advancing a completed prompt turn', async () => {
    const fixture = createFixture();
    const result = await sendCodexPromptTurn(fixture.options);

    expect(fixture.connection.runTurn).toHaveBeenCalledWith(
      {
        threadId: 'thread-1',
        text: 'analysis instructions',
        cwd: 'D:\\Data',
        model: 'gpt-current',
        effort: 'high',
      },
      60_000,
      expect.any(Function),
    );
    expect(fixture.updateRegistry).toHaveBeenCalledTimes(2);
    expect(result.turn).toBe(fixture.completed);
    expect(result.registry.sessions[0]).toMatchObject({
      bootstrapStatus: 'analysisPending',
      promptTurnId: 'turn-prompt',
      lastTurnId: 'turn-prompt',
      lastUsedAt: '2026-07-19T01:02:00.000Z',
    });
  });

  it('should retain the accepted turn ID when the terminal turn fails', async () => {
    const fixture = createFixture();
    fixture.connection.runTurn.mockImplementation(async (_turnOptions, _timeoutMs, onStarted) => {
      await onStarted?.(fixture.started);
      return {
        ...fixture.completed,
        status: 'failed',
        error: { message: 'failed', codexErrorInfo: null, additionalDetails: null },
      };
    });

    await expect(sendCodexPromptTurn(fixture.options)).rejects.toMatchObject({
      code: 'turn_failed',
    });
    expect(fixture.updateRegistry).toHaveBeenCalledOnce();
    expect(fixture.getRegistry().sessions[0]).toMatchObject({
      bootstrapStatus: 'promptPending',
      promptTurnId: 'turn-prompt',
      lastTurnId: 'turn-prompt',
    });
  });

  it('should reject a prompt turn that already has an external ID', async () => {
    const fixture = createFixture();
    const state = { ...fixture.state, promptTurnId: 'existing-turn', lastTurnId: 'existing-turn' };

    await expect(sendCodexPromptTurn({ ...fixture.options, state })).rejects.toBeInstanceOf(
      CodexPromptTurnError,
    );
    expect(fixture.connection.runTurn).not.toHaveBeenCalled();
  });

  it('should reject an acceptance transition that was not persisted', async () => {
    const fixture = createFixture();
    const initial = fixture.getRegistry();

    await expect(
      sendCodexPromptTurn({
        ...fixture.options,
        updateRegistry: async () => initial,
      }),
    ).rejects.toMatchObject({ code: 'acceptance_not_persisted' });
  });

  it('should reject a completion transition that was not persisted', async () => {
    const fixture = createFixture();
    let persisted = fixture.getRegistry();
    let callCount = 0;

    await expect(
      sendCodexPromptTurn({
        ...fixture.options,
        updateRegistry: async (update) => {
          callCount += 1;
          if (callCount === 1) persisted = update(persisted);
          return persisted;
        },
      }),
    ).rejects.toMatchObject({ code: 'completion_not_persisted' });
  });
});
