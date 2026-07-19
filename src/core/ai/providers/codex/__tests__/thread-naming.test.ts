import { describe, expect, it } from 'vitest';
import type { CodexThreadRegistryV1, CodexThreadState } from '../thread-state';
import { resolveNextCodexThreadIdentity } from '../thread-naming';

function createSession(generation: number, displayName: string): CodexThreadState {
  return {
    kind: 'codex',
    schemaVersion: 1,
    localSessionId: `session-${generation}`,
    threadId: `thread-${generation}`,
    generation,
    displayName,
    promptHash: 'a'.repeat(64),
    bootstrapStatus: 'ready',
    promptTurnId: 'turn-prompt',
    initialAnalysisTurnId: 'turn-analysis',
    lastTurnId: 'turn-analysis',
    model: 'gpt-current',
    lastReasoningEffort: 'high',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.144.5',
    projectPath: 'D:\\data',
    instructionSources: [],
    createdAt: '2026-07-19T01:00:00.000Z',
    lastUsedAt: '2026-07-19T02:00:00.000Z',
  };
}

function createRegistry(sessions: CodexThreadState[]): CodexThreadRegistryV1 {
  return {
    schemaVersion: 1,
    activeSessionId:
      sessions.find((session) => session.bootstrapStatus === 'ready')?.localSessionId ?? null,
    sessions,
  };
}

describe('resolveNextCodexThreadIdentity', () => {
  it('should use the base insight name for the first generation', () => {
    expect(resolveNextCodexThreadIdentity('alice', createRegistry([]))).toEqual({
      generation: 1,
      displayName: 'alice-insight',
    });
  });

  it('should increment from the highest recorded generation', () => {
    const registry = createRegistry([
      createSession(1, 'alice-insight'),
      createSession(3, 'alice-insight-3'),
    ]);
    expect(resolveNextCodexThreadIdentity('alice', registry)).toEqual({
      generation: 4,
      displayName: 'alice-insight-4',
    });
  });

  it('should advance again when a historical display name collides', () => {
    const registry = createRegistry([createSession(1, 'alice-insight-2')]);
    expect(resolveNextCodexThreadIdentity('alice', registry)).toEqual({
      generation: 3,
      displayName: 'alice-insight-3',
    });
  });

  it.each(['', 'alice name', '../alice'])('should reject invalid username %j', (username) => {
    expect(() => resolveNextCodexThreadIdentity(username, createRegistry([]))).toThrow(RangeError);
  });
});
