import { describe, expect, it } from 'vitest';
import type { CodexThreadRegistryV1, CodexThreadState } from '../thread-state';
import { isCodexThreadRegistryV1 } from '../thread-state-validator';

const HASH = 'a'.repeat(64);

function createPendingAnalysis(turnId: string | null = null) {
  return {
    deliveryId: 'delivery-1',
    providerKey: `codex:${HASH}`,
    analysisFingerprint: HASH,
    payloadHash: HASH,
    basedOnPartial: false,
    deliveryMode: 'change' as const,
    reasoningEffort: 'high',
    turnId,
  };
}

function createSession(overrides: Partial<CodexThreadState> = {}): CodexThreadState {
  return {
    kind: 'codex',
    schemaVersion: 1,
    localSessionId: 'session-1',
    threadId: 'thread-1',
    generation: 1,
    displayName: 'alice-insight',
    promptHash: HASH,
    bootstrapStatus: 'ready',
    promptTurnId: 'turn-prompt',
    initialAnalysisTurnId: 'turn-analysis',
    lastTurnId: 'turn-analysis',
    model: 'gpt-current',
    lastReasoningEffort: 'high',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.144.5',
    projectPath: 'D:\\data',
    instructionSources: ['D:\\data\\AGENTS.md'],
    createdAt: '2026-07-19T01:00:00.000Z',
    lastUsedAt: '2026-07-19T02:00:00.000Z',
    ...overrides,
  };
}

function createRegistry(sessions = [createSession()]): CodexThreadRegistryV1 {
  return { schemaVersion: 1, activeSessionId: 'session-1', sessions };
}

describe('isCodexThreadRegistryV1', () => {
  it('should accept empty, pending, and active registries', () => {
    expect(isCodexThreadRegistryV1({ schemaVersion: 1, activeSessionId: null, sessions: [] })).toBe(
      true,
    );
    expect(
      isCodexThreadRegistryV1({
        schemaVersion: 1,
        activeSessionId: null,
        sessions: [
          createSession({
            bootstrapStatus: 'promptPending',
            promptTurnId: null,
            initialAnalysisTurnId: null,
            lastTurnId: null,
          }),
        ],
      }),
    ).toBe(true);
    expect(
      isCodexThreadRegistryV1({
        schemaVersion: 1,
        activeSessionId: null,
        sessions: [
          createSession({
            bootstrapStatus: 'analysisPending',
            initialAnalysisTurnId: null,
            lastTurnId: 'turn-prompt',
          }),
        ],
      }),
    ).toBe(true);
    expect(isCodexThreadRegistryV1(createRegistry())).toBe(true);
    expect(
      isCodexThreadRegistryV1(
        createRegistry([
          createSession({ pendingAnalysis: createPendingAnalysis('turn-analysis') }),
        ]),
      ),
    ).toBe(true);
  });

  it('should enforce bootstrap turn invariants', () => {
    expect(
      isCodexThreadRegistryV1({
        schemaVersion: 1,
        activeSessionId: null,
        sessions: [
          createSession({
            bootstrapStatus: 'analysisPending',
            promptTurnId: null,
            initialAnalysisTurnId: null,
          }),
        ],
      }),
    ).toBe(false);
    expect(
      isCodexThreadRegistryV1(
        createRegistry([createSession({ bootstrapStatus: 'ready', initialAnalysisTurnId: null })]),
      ),
    ).toBe(false);
    expect(isCodexThreadRegistryV1(createRegistry([createSession({ lastTurnId: null })]))).toBe(
      false,
    );
    expect(
      isCodexThreadRegistryV1({
        schemaVersion: 1,
        activeSessionId: null,
        sessions: [
          createSession({
            bootstrapStatus: 'promptPending',
            initialAnalysisTurnId: null,
            lastTurnId: 'different-turn',
          }),
        ],
      }),
    ).toBe(false);
  });

  it('should require the active session to reference a ready entry', () => {
    expect(
      isCodexThreadRegistryV1({
        ...createRegistry(),
        activeSessionId: 'missing',
      }),
    ).toBe(false);
    expect(
      isCodexThreadRegistryV1({
        schemaVersion: 1,
        activeSessionId: null,
        sessions: [createSession()],
      }),
    ).toBe(false);
  });

  it.each([
    ['local session ID', { localSessionId: 'session-1' }],
    ['thread ID', { threadId: 'thread-1' }],
    ['generation', { generation: 1 }],
    ['display name', { displayName: 'alice-insight' }],
  ])('should reject duplicate %s', (_field, duplicate) => {
    const second = createSession({
      localSessionId: 'session-2',
      threadId: 'thread-2',
      generation: 2,
      displayName: 'alice-insight-2',
      ...duplicate,
    });
    expect(isCodexThreadRegistryV1(createRegistry([createSession(), second]))).toBe(false);
  });

  it('should reject invalid hashes, timestamps, and reversed usage time', () => {
    expect(
      isCodexThreadRegistryV1(createRegistry([createSession({ promptHash: 'invalid' })])),
    ).toBe(false);
    expect(
      isCodexThreadRegistryV1(createRegistry([createSession({ createdAt: 'not-a-date' })])),
    ).toBe(false);
    expect(
      isCodexThreadRegistryV1(
        createRegistry([
          createSession({
            createdAt: '2026-07-19T03:00:00.000Z',
            lastUsedAt: '2026-07-19T02:00:00.000Z',
          }),
        ]),
      ),
    ).toBe(false);
  });

  it('should enforce pending analysis identity and turn alignment', () => {
    expect(
      isCodexThreadRegistryV1(
        createRegistry([
          createSession({
            pendingAnalysis: { ...createPendingAnalysis('turn-analysis'), payloadHash: 'invalid' },
          }),
        ]),
      ),
    ).toBe(false);
    expect(
      isCodexThreadRegistryV1(
        createRegistry([
          createSession({ pendingAnalysis: createPendingAnalysis('different-turn') }),
        ]),
      ),
    ).toBe(false);
    expect(
      isCodexThreadRegistryV1({
        schemaVersion: 1,
        activeSessionId: null,
        sessions: [
          createSession({
            bootstrapStatus: 'promptPending',
            promptTurnId: null,
            initialAnalysisTurnId: null,
            lastTurnId: null,
            pendingAnalysis: createPendingAnalysis(),
          }),
        ],
      }),
    ).toBe(false);
  });
});
