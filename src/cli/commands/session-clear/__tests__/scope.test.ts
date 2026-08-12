import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readStore: vi.fn(),
  inspectCodexStorage: vi.fn(),
}));

vi.mock('@/infra/storage', async () => {
  const actual = await vi.importActual<typeof import('@/infra/storage')>('@/infra/storage');
  return {
    ...actual,
    inspectCodexSessionStorage: mocks.inspectCodexStorage,
    readAISessionStore: mocks.readStore,
  };
});

import { buildSessionClearPreview, sessionClearPreviewsMatch } from '../scope';

const GEMINI_ONE_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb810';
const GEMINI_TWO_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb811';
const CODEX_ONE_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb812';

const geminiOne = {
  schemaVersion: 1 as const,
  localSessionId: GEMINI_ONE_ID,
  username: 'alice',
  provider: 'gemini' as const,
  generation: 1,
  promptHash: 'a'.repeat(64),
  model: 'gemini-current',
  createdAt: '2026-08-08T01:00:00.000Z',
  lastUsedAt: '2026-08-08T01:00:00.000Z',
  lastSuccessfulAnalysisAt: null,
  lastResultVersionId: null,
  lastAnalysisFingerprint: null,
  systemInstruction: 'Analyze.',
  thinkingLevel: 'high',
  history: [],
};

const geminiTwo = {
  ...geminiOne,
  localSessionId: GEMINI_TWO_ID,
  generation: 2,
  createdAt: '2026-08-08T02:00:00.000Z',
  lastUsedAt: '2026-08-08T02:00:00.000Z',
};

const codexOne = {
  schemaVersion: 1 as const,
  localSessionId: CODEX_ONE_ID,
  username: 'alice',
  provider: 'codex' as const,
  generation: 1,
  promptHash: 'b'.repeat(64),
  model: 'gpt-current',
  createdAt: '2026-08-08T01:00:00.000Z',
  lastUsedAt: '2026-08-08T01:00:00.000Z',
  lastSuccessfulAnalysisAt: null,
  lastResultVersionId: null,
  lastAnalysisFingerprint: null,
  kind: 'codex' as const,
  threadId: 'thread-1',
  externalThreadId: 'thread-1',
  displayName: 'alice-insight',
  bootstrapStatus: 'ready' as const,
  promptTurnId: 'prompt-1',
  initialAnalysisTurnId: 'analysis-1',
  lastTurnId: 'analysis-1',
  lastReasoningEffort: 'high',
  executablePath: 'codex.exe',
  executableVersion: '0.144.5',
  projectPath: 'D:\\data',
  instructionSources: [],
};

function createStore() {
  return {
    status: 'valid' as const,
    index: {
      schemaVersion: 1 as const,
      lastSuccessfulAnalysisProvider: 'gemini' as const,
      activeByProvider: { gemini: GEMINI_TWO_ID, codex: CODEX_ONE_ID },
      sessions: [],
      updatedAt: '2026-08-08T02:00:00.000Z',
    },
    sessions: [geminiOne, geminiTwo, codexOne],
  };
}

describe('session clear scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readStore.mockReturnValue(createStore());
  });

  it('defaults to the active session of the last successful provider', () => {
    expect(buildSessionClearPreview('alice', undefined, false)).toEqual([
      {
        provider: 'gemini',
        localSessionId: GEMINI_TWO_ID,
        generation: 2,
        externalThreadId: null,
        displayName: null,
      },
    ]);
  });

  it('orders every provider generation and detects destructive identity changes', () => {
    const preview = buildSessionClearPreview('alice', 'all', true);

    expect(preview.map((target) => target.localSessionId)).toEqual([
      CODEX_ONE_ID,
      GEMINI_ONE_ID,
      GEMINI_TWO_ID,
    ]);
    expect(sessionClearPreviewsMatch(preview, [geminiTwo, codexOne, geminiOne])).toBe(true);
    expect(
      sessionClearPreviewsMatch(preview, [
        geminiTwo,
        { ...codexOne, externalThreadId: 'changed-thread', threadId: 'changed-thread' },
        geminiOne,
      ]),
    ).toBe(false);
  });

  it('previews the active legacy Codex thread without migrating it', () => {
    mocks.readStore.mockReturnValue({ status: 'missing' });
    mocks.inspectCodexStorage.mockReturnValue({
      migration: 'pending',
      registry: {
        status: 'valid',
        registry: {
          activeSessionId: CODEX_ONE_ID,
          sessions: [codexOne],
        },
      },
    });

    expect(buildSessionClearPreview('alice', 'codex', false)).toEqual([
      expect.objectContaining({
        provider: 'codex',
        localSessionId: CODEX_ONE_ID,
        externalThreadId: 'thread-1',
      }),
    ]);
  });
});
