import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeminiSessionStateV1 } from '@/core/ai/sessions/types';

const mockedReadJsonFileResult = vi.hoisted(() => vi.fn());
const mockedWriteJsonFileAtomically = vi.hoisted(() => vi.fn());

vi.mock('../../reader', () => ({ readJsonFileResult: mockedReadJsonFileResult }));
vi.mock('../../writer', () => ({ writeJsonFileAtomically: mockedWriteJsonFileAtomically }));

import {
  readAISessionIndex,
  readAISessionState,
  readAISessionStore,
  writeAISessionIndex,
  writeAISessionState,
} from '../repository';

const HASH = 'a'.repeat(64);
const SESSION_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb810';

function createSession(): GeminiSessionStateV1 {
  return {
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
}

describe('AI session repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('distinguishes missing, invalid, and valid indexes', () => {
    mockedReadJsonFileResult.mockReturnValueOnce({ status: 'missing' });
    expect(readAISessionIndex('alice')).toEqual({ status: 'missing' });

    mockedReadJsonFileResult.mockReturnValueOnce({ status: 'success', data: {} });
    expect(readAISessionIndex('alice')).toEqual({ status: 'invalid' });

    const index = {
      schemaVersion: 1,
      lastSuccessfulAnalysisProvider: null,
      activeByProvider: {},
      sessions: [],
      updatedAt: '2026-08-02T01:00:00.000Z',
    };
    mockedReadJsonFileResult.mockReturnValueOnce({ status: 'success', data: index });
    expect(readAISessionIndex('alice')).toEqual({ status: 'valid', index });
  });

  it('rejects a valid session stored under another user identity', () => {
    mockedReadJsonFileResult.mockReturnValue({
      status: 'success',
      data: { ...createSession(), username: 'bob' },
    });
    expect(readAISessionState('alice', 'gemini', SESSION_ID)).toEqual({ status: 'invalid' });
  });

  it('requires every indexed summary to match its provider file', () => {
    const session = createSession();
    const summary = {
      localSessionId: SESSION_ID,
      provider: 'gemini' as const,
      generation: 1,
      status: 'ready' as const,
      model: session.model,
      promptHash: HASH,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      externalThreadId: null,
    };
    const index = {
      schemaVersion: 1,
      lastSuccessfulAnalysisProvider: null,
      activeByProvider: {},
      sessions: [summary],
      updatedAt: session.lastUsedAt,
    };
    mockedReadJsonFileResult
      .mockReturnValueOnce({ status: 'success', data: index })
      .mockReturnValueOnce({ status: 'success', data: session });
    expect(readAISessionStore('alice')).toEqual({ status: 'valid', index, sessions: [session] });

    mockedReadJsonFileResult
      .mockReturnValueOnce({ status: 'success', data: index })
      .mockReturnValueOnce({
        status: 'success',
        data: { ...session, lastUsedAt: '2026-08-02T02:00:00.000Z' },
      });
    expect(readAISessionStore('alice')).toEqual({ status: 'invalid' });
  });

  it('validates session and index values before atomic writes', () => {
    const session = createSession();
    writeAISessionState('alice', session);
    const index = {
      schemaVersion: 1 as const,
      lastSuccessfulAnalysisProvider: null,
      activeByProvider: {},
      sessions: [],
      updatedAt: '2026-08-02T01:00:00.000Z',
    };
    writeAISessionIndex('alice', index);

    expect(mockedWriteJsonFileAtomically).toHaveBeenCalledTimes(2);
    expect(() => writeAISessionState('bob', session)).toThrow(TypeError);
    expect(() => writeAISessionIndex('alice', { ...index, schemaVersion: 2 } as never)).toThrow(
      TypeError,
    );
  });
});
