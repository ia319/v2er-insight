import { describe, expect, it } from 'vitest';
import type { CodexThreadRegistryV1, CodexThreadState } from '../thread-state';
import {
  CodexThreadRegistryError,
  appendPendingCodexThreadState,
  createPendingCodexThreadState,
} from '../thread-registry';

const HASH = 'a'.repeat(64);

function createPendingInput() {
  return {
    localSessionId: 'session-2',
    threadId: 'thread-2',
    generation: 2,
    displayName: 'alice-insight-2',
    promptHash: HASH,
    model: 'gpt-current',
    reasoningEffort: 'high',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.144.5',
    projectPath: 'D:\\data',
    instructionSources: ['D:\\data\\AGENTS.md'],
    createdAt: '2026-07-19T03:00:00.000Z',
  };
}

function createReadySession(): CodexThreadState {
  return {
    ...createPendingCodexThreadState({
      ...createPendingInput(),
      localSessionId: 'session-1',
      threadId: 'thread-1',
      generation: 1,
      displayName: 'alice-insight',
      createdAt: '2026-07-19T01:00:00.000Z',
    }),
    bootstrapStatus: 'ready',
    promptTurnId: 'turn-prompt',
    initialAnalysisTurnId: 'turn-analysis',
    lastTurnId: 'turn-analysis',
    lastUsedAt: '2026-07-19T02:00:00.000Z',
  };
}

describe('Codex thread registry transitions', () => {
  it('should create a prompt-pending session from runtime metadata', () => {
    expect(createPendingCodexThreadState(createPendingInput())).toEqual({
      kind: 'codex',
      schemaVersion: 1,
      localSessionId: 'session-2',
      threadId: 'thread-2',
      generation: 2,
      displayName: 'alice-insight-2',
      promptHash: HASH,
      bootstrapStatus: 'promptPending',
      promptTurnId: null,
      initialAnalysisTurnId: null,
      lastTurnId: null,
      model: 'gpt-current',
      lastReasoningEffort: 'high',
      executablePath: 'C:\\App\\codex.exe',
      executableVersion: '0.144.5',
      projectPath: 'D:\\data',
      instructionSources: ['D:\\data\\AGENTS.md'],
      createdAt: '2026-07-19T03:00:00.000Z',
      lastUsedAt: '2026-07-19T03:00:00.000Z',
    });
  });

  it('should copy instruction sources owned by the caller', () => {
    const input = createPendingInput();
    const state = createPendingCodexThreadState(input);
    input.instructionSources.push('D:\\data\\SECOND.md');

    expect(state.instructionSources).toEqual(['D:\\data\\AGENTS.md']);
  });

  it('should append a pending session and preserve the active ready session', () => {
    const ready = createReadySession();
    const registry: CodexThreadRegistryV1 = {
      schemaVersion: 1,
      activeSessionId: ready.localSessionId,
      sessions: [ready],
    };
    const pending = createPendingCodexThreadState(createPendingInput());

    expect(appendPendingCodexThreadState(registry, pending)).toEqual({
      ...registry,
      sessions: [ready, pending],
    });
  });

  it('should reject invalid metadata and duplicate session fields', () => {
    expect(() =>
      createPendingCodexThreadState({ ...createPendingInput(), promptHash: 'invalid' }),
    ).toThrow(CodexThreadRegistryError);

    const pending = createPendingCodexThreadState(createPendingInput());
    const registry: CodexThreadRegistryV1 = {
      schemaVersion: 1,
      activeSessionId: null,
      sessions: [pending],
    };
    expect(() => appendPendingCodexThreadState(registry, pending)).toThrow(
      CodexThreadRegistryError,
    );
  });
});
