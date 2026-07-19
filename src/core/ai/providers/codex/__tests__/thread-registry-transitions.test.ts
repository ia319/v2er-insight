import { describe, expect, it } from 'vitest';
import {
  CodexThreadRegistryError,
  activateCodexThreadSession,
  appendPendingCodexThreadState,
  completeCodexPromptTurn,
  completeCodexThreadTurn,
  createPendingCodexThreadState,
  recordCodexInitialAnalysisTurn,
  recordCodexPromptTurn,
  recordCodexThreadTurnStart,
} from '../thread-registry';
import type { CodexThreadRegistryV1, CodexThreadState } from '../thread-state';

const HASH = 'a'.repeat(64);

function createPendingSession(): CodexThreadState {
  return createPendingCodexThreadState({
    localSessionId: 'session-2',
    threadId: 'thread-2',
    generation: 2,
    displayName: 'alice-insight-2',
    promptHash: HASH,
    model: 'gpt-current',
    reasoningEffort: 'low',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.144.5',
    projectPath: 'D:\\data',
    instructionSources: [],
    createdAt: '2026-07-19T02:00:00.000Z',
  });
}

function createReadySession(): CodexThreadState {
  return {
    ...createPendingSession(),
    localSessionId: 'session-1',
    threadId: 'thread-1',
    generation: 1,
    displayName: 'alice-insight',
    bootstrapStatus: 'ready',
    promptTurnId: 'old-prompt',
    initialAnalysisTurnId: 'old-analysis',
    lastTurnId: 'old-analysis',
  };
}

function createRegistry(): CodexThreadRegistryV1 {
  const ready = createReadySession();
  return appendPendingCodexThreadState(
    { schemaVersion: 1, activeSessionId: ready.localSessionId, sessions: [ready] },
    createPendingSession(),
  );
}

function getSession(registry: CodexThreadRegistryV1, localSessionId: string): CodexThreadState {
  const session = registry.sessions.find((entry) => entry.localSessionId === localSessionId);
  if (!session) throw new Error('Expected test session');
  return session;
}

describe('Codex thread registry stage transitions', () => {
  it('should advance bootstrap turns and switch the active session after analysis', () => {
    let registry = createRegistry();
    registry = recordCodexPromptTurn(
      registry,
      'session-2',
      'new-prompt',
      '2026-07-19T02:01:00.000Z',
    );
    registry = completeCodexPromptTurn(
      registry,
      'session-2',
      'new-prompt',
      '2026-07-19T02:02:00.000Z',
    );
    registry = recordCodexInitialAnalysisTurn(
      registry,
      'session-2',
      'new-analysis',
      '2026-07-19T02:03:00.000Z',
    );
    registry = activateCodexThreadSession(
      registry,
      'session-2',
      'new-analysis',
      'high',
      '2026-07-19T02:04:00.000Z',
    );

    expect(registry.activeSessionId).toBe('session-2');
    expect(getSession(registry, 'session-2')).toMatchObject({
      bootstrapStatus: 'ready',
      promptTurnId: 'new-prompt',
      initialAnalysisTurnId: 'new-analysis',
      lastTurnId: 'new-analysis',
      lastReasoningEffort: 'high',
    });
    expect(getSession(registry, 'session-1').bootstrapStatus).toBe('ready');
  });

  it('should record a ready-session turn before updating successful effort', () => {
    let registry = createRegistry();
    registry = recordCodexThreadTurnStart(
      registry,
      'session-1',
      'update-turn',
      '2026-07-19T02:01:00.000Z',
    );
    expect(getSession(registry, 'session-1')).toMatchObject({
      lastTurnId: 'update-turn',
      lastReasoningEffort: 'low',
    });

    registry = completeCodexThreadTurn(
      registry,
      'session-1',
      'update-turn',
      'high',
      '2026-07-19T02:02:00.000Z',
    );
    expect(getSession(registry, 'session-1').lastReasoningEffort).toBe('high');
  });

  it('should reject missing sessions, out-of-order stages, and mismatched turn IDs', () => {
    const registry = createRegistry();
    expect(() =>
      recordCodexPromptTurn(registry, 'missing', 'turn', '2026-07-19T02:01:00.000Z'),
    ).toThrow(CodexThreadRegistryError);
    expect(() =>
      recordCodexInitialAnalysisTurn(registry, 'session-2', 'analysis', '2026-07-19T02:01:00.000Z'),
    ).toThrow(CodexThreadRegistryError);

    const prompted = recordCodexPromptTurn(
      registry,
      'session-2',
      'prompt',
      '2026-07-19T02:01:00.000Z',
    );
    expect(() =>
      completeCodexPromptTurn(prompted, 'session-2', 'different', '2026-07-19T02:02:00.000Z'),
    ).toThrow(CodexThreadRegistryError);
  });

  it('should reject usage timestamps that move backwards', () => {
    expect(() =>
      recordCodexPromptTurn(createRegistry(), 'session-2', 'prompt', '2026-07-19T01:59:00.000Z'),
    ).toThrow(CodexThreadRegistryError);
  });
});
