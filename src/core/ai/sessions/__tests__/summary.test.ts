import { describe, expect, it } from 'vitest';
import type { CodexSessionStateV1, GeminiSessionStateV1 } from '../types';
import { createAISessionSummary } from '../summary';

const HASH = 'a'.repeat(64);
const SESSION_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb810';

describe('createAISessionSummary', () => {
  it('projects Gemini sessions without an external thread', () => {
    const session: GeminiSessionStateV1 = {
      schemaVersion: 1,
      localSessionId: SESSION_ID,
      username: 'alice',
      provider: 'gemini',
      generation: 1,
      promptHash: HASH,
      model: 'gemini-current',
      createdAt: '2026-08-02T01:00:00.000Z',
      lastUsedAt: '2026-08-02T01:00:00.000Z',
      lastSuccessfulAnalysisAt: null,
      lastResultVersionId: null,
      lastAnalysisFingerprint: null,
      systemInstruction: 'Analyze.',
      thinkingLevel: 'high',
      history: [],
    };

    expect(createAISessionSummary(session)).toMatchObject({
      provider: 'gemini',
      status: 'ready',
      externalThreadId: null,
    });
  });

  it('projects the current Codex bootstrap status and thread ID', () => {
    const session: CodexSessionStateV1 = {
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
      bootstrapStatus: 'analysisPending',
      promptTurnId: 'prompt-turn',
      initialAnalysisTurnId: null,
      lastTurnId: 'prompt-turn',
      model: 'gpt-current',
      lastReasoningEffort: 'high',
      executablePath: 'C:\\App\\codex.exe',
      executableVersion: '0.146.0',
      projectPath: 'D:\\data',
      instructionSources: [],
      createdAt: '2026-08-02T01:00:00.000Z',
      lastUsedAt: '2026-08-02T01:00:00.000Z',
      lastSuccessfulAnalysisAt: null,
      lastResultVersionId: null,
      lastAnalysisFingerprint: null,
    };

    expect(createAISessionSummary(session)).toMatchObject({
      provider: 'codex',
      status: 'analysisPending',
      externalThreadId: 'thread-1',
    });
  });
});
