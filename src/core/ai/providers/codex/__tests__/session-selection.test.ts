import { describe, expect, it } from 'vitest';
import type {
  CodexBootstrapStatus,
  CodexThreadRegistryV1,
  CodexThreadState,
} from '../thread-state';
import { selectCodexSession } from '../session-selection';

const PROMPT_HASH = 'a'.repeat(64);

function createSession(
  generation: number,
  bootstrapStatus: CodexBootstrapStatus = 'ready',
  overrides: Partial<CodexThreadState> = {},
): CodexThreadState {
  const promptTurnId = bootstrapStatus === 'promptPending' ? null : `prompt-${generation}`;
  const initialAnalysisTurnId = bootstrapStatus === 'ready' ? `analysis-${generation}` : null;
  return {
    kind: 'codex',
    schemaVersion: 1,
    localSessionId: `session-${generation}`,
    threadId: `thread-${generation}`,
    generation,
    displayName: generation === 1 ? 'alice-insight' : `alice-insight-${generation}`,
    promptHash: PROMPT_HASH,
    bootstrapStatus,
    promptTurnId,
    initialAnalysisTurnId,
    lastTurnId: initialAnalysisTurnId ?? promptTurnId,
    model: 'gpt-current',
    lastReasoningEffort: 'high',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.144.5',
    projectPath: 'D:\\Data',
    instructionSources: [],
    createdAt: '2026-07-19T01:00:00.000Z',
    lastUsedAt: '2026-07-19T02:00:00.000Z',
    ...overrides,
  };
}

function createRegistry(
  sessions: CodexThreadState[],
  activeSessionId: string | null,
): CodexThreadRegistryV1 {
  return { schemaVersion: 1, activeSessionId, sessions };
}

const TARGET = {
  promptHash: PROMPT_HASH,
  model: 'gpt-current',
  projectPath: 'D:\\Data',
  platform: 'win32',
} as const;

describe('selectCodexSession', () => {
  it('should create the first generation without a ready session', () => {
    expect(selectCodexSession(createRegistry([], null), TARGET)).toEqual({
      kind: 'create',
      causes: ['no_ready_session'],
    });
  });

  it('should honor an explicit new-generation request', () => {
    const active = createSession(1);
    expect(
      selectCodexSession(createRegistry([active], active.localSessionId), {
        ...TARGET,
        forceNew: true,
      }),
    ).toEqual({ kind: 'create', causes: ['explicit_request'] });
  });

  it('should recover the latest compatible pending generation before the active session', () => {
    const active = createSession(1);
    const pending2 = createSession(2, 'analysisPending');
    const pending3 = createSession(3, 'promptPending');
    const registry = createRegistry([pending3, active, pending2], active.localSessionId);

    expect(selectCodexSession(registry, TARGET)).toEqual({
      kind: 'resume',
      source: 'pending',
      session: pending3,
    });
  });

  it('should reuse the compatible active session', () => {
    const active = createSession(1);
    expect(selectCodexSession(createRegistry([active], active.localSessionId), TARGET)).toEqual({
      kind: 'resume',
      source: 'active',
      session: active,
    });
  });

  it('should ignore pending generations that do not match the current target', () => {
    const active = createSession(1);
    const pending = createSession(2, 'promptPending', { model: 'gpt-next' });
    expect(
      selectCodexSession(createRegistry([active, pending], active.localSessionId), TARGET),
    ).toEqual({
      kind: 'resume',
      source: 'active',
      session: active,
    });
  });

  it('should report every target change that requires a new generation', () => {
    const active = createSession(1);
    expect(
      selectCodexSession(createRegistry([active], active.localSessionId), {
        promptHash: 'b'.repeat(64),
        model: 'gpt-next',
        projectPath: 'D:\\Other',
        platform: 'win32',
      }),
    ).toEqual({
      kind: 'create',
      causes: ['prompt_changed', 'model_changed', 'project_changed'],
    });
  });

  it('should compare Windows Project paths case-insensitively', () => {
    const active = createSession(1);
    expect(
      selectCodexSession(createRegistry([active], active.localSessionId), {
        ...TARGET,
        projectPath: 'd:\\data',
      }),
    ).toMatchObject({ kind: 'resume', source: 'active' });
  });
});
