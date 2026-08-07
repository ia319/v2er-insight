import { describe, expect, it } from 'vitest';
import type { AISessionIndexV1, CodexSessionStateV1, GeminiSessionStateV1 } from '../types';
import { isAISessionIndexV1, isCodexSessionStateV1, isGeminiSessionStateV1 } from '../validator';

const HASH = 'a'.repeat(64);
const SESSION_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb810';

function createGeminiSession(overrides: Partial<GeminiSessionStateV1> = {}): GeminiSessionStateV1 {
  return {
    schemaVersion: 1,
    localSessionId: SESSION_ID,
    username: 'alice',
    provider: 'gemini',
    generation: 1,
    promptHash: HASH,
    model: 'gemini-current',
    createdAt: '2026-08-02T01:00:00.000Z',
    lastUsedAt: '2026-08-02T02:00:00.000Z',
    lastSuccessfulAnalysisAt: '2026-08-02T02:00:00.000Z',
    lastResultVersionId: 'v000001',
    lastAnalysisFingerprint: HASH,
    systemInstruction: 'Analyze the input.',
    thinkingLevel: 'high',
    history: [
      { role: 'user', parts: [{ text: '{}' }] },
      { role: 'model', parts: [{ text: '{"summary":"ok"}' }] },
    ],
    ...overrides,
  };
}

function createCodexSession(overrides: Partial<CodexSessionStateV1> = {}): CodexSessionStateV1 {
  return {
    kind: 'codex',
    schemaVersion: 1,
    localSessionId: SESSION_ID,
    username: 'alice',
    provider: 'codex',
    generation: 1,
    threadId: 'thread-1',
    externalThreadId: 'thread-1',
    displayName: 'alice-insight',
    promptHash: HASH,
    bootstrapStatus: 'ready',
    promptTurnId: 'turn-prompt',
    initialAnalysisTurnId: 'turn-analysis',
    lastTurnId: 'turn-analysis',
    model: 'gpt-current',
    lastReasoningEffort: 'high',
    executablePath: 'C:\\App\\codex.exe',
    executableVersion: '0.146.0',
    projectPath: 'D:\\data',
    instructionSources: [],
    createdAt: '2026-08-02T01:00:00.000Z',
    lastUsedAt: '2026-08-02T02:00:00.000Z',
    lastSuccessfulAnalysisAt: null,
    lastResultVersionId: null,
    lastAnalysisFingerprint: null,
    ...overrides,
  };
}

describe('AI session validators', () => {
  it('accepts paired Gemini history and a complete result reference', () => {
    expect(isGeminiSessionStateV1(createGeminiSession())).toBe(true);
  });

  it('rejects incomplete result references and unpaired Gemini history', () => {
    expect(isGeminiSessionStateV1(createGeminiSession({ lastResultVersionId: null }))).toBe(false);
    expect(
      isGeminiSessionStateV1(
        createGeminiSession({ history: [{ role: 'user', parts: [{ text: '{}' }] }] }),
      ),
    ).toBe(false);
  });

  it('accepts migrated Codex state and requires matching external thread identity', () => {
    expect(isCodexSessionStateV1(createCodexSession())).toBe(true);
    expect(isCodexSessionStateV1(createCodexSession({ externalThreadId: 'different' }))).toBe(
      false,
    );
  });

  it('rejects unknown persisted session fields', () => {
    expect(isGeminiSessionStateV1({ ...createGeminiSession(), unexpected: true })).toBe(false);
  });
});

describe('isAISessionIndexV1', () => {
  function createIndex(overrides: Partial<AISessionIndexV1> = {}): AISessionIndexV1 {
    return {
      schemaVersion: 1,
      lastSuccessfulAnalysisProvider: 'gemini',
      activeByProvider: { gemini: SESSION_ID },
      sessions: [
        {
          localSessionId: SESSION_ID,
          provider: 'gemini',
          generation: 1,
          status: 'ready',
          model: 'gemini-current',
          promptHash: HASH,
          createdAt: '2026-08-02T01:00:00.000Z',
          lastUsedAt: '2026-08-02T02:00:00.000Z',
          externalThreadId: null,
        },
      ],
      updatedAt: '2026-08-02T02:00:00.000Z',
      ...overrides,
    };
  }

  it('accepts active sessions and a completed Codex migration marker', () => {
    expect(
      isAISessionIndexV1(
        createIndex({
          migration: {
            source: 'codex-sessions-v1',
            sourceHash: HASH,
            completedAt: '2026-08-02T02:00:00.000Z',
          },
        }),
      ),
    ).toBe(true);
  });

  it('rejects missing active targets and duplicate provider generations', () => {
    expect(
      isAISessionIndexV1(createIndex({ activeByProvider: { gemini: crypto.randomUUID() } })),
    ).toBe(false);
    const index = createIndex();
    expect(
      isAISessionIndexV1({
        ...index,
        sessions: [
          ...index.sessions,
          { ...index.sessions[0], localSessionId: crypto.randomUUID() },
        ],
      }),
    ).toBe(false);
  });
});
