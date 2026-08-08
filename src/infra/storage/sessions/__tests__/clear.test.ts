import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { createAISessionSummary } from '@/core/ai/sessions/summary';
import type { AISessionIndexV1, GeminiSessionStateV1 } from '@/core/ai/sessions/types';

const mockedReadAISessionStore = vi.hoisted(() => vi.fn());
const mockedWriteAISessionIndex = vi.hoisted(() => vi.fn());

vi.mock('node:fs');
vi.mock('../repository', () => ({
  readAISessionStore: mockedReadAISessionStore,
  writeAISessionIndex: mockedWriteAISessionIndex,
}));

import { deleteAISession } from '../clear';
import { AISessionPersistError } from '../errors';

const mockedFs = vi.mocked(fs);
const SESSION_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb810';

function createSession(): GeminiSessionStateV1 {
  return {
    schemaVersion: 1,
    localSessionId: SESSION_ID,
    username: 'alice',
    provider: 'gemini',
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
}

function createIndex(session: GeminiSessionStateV1): AISessionIndexV1 {
  return {
    schemaVersion: 1,
    lastSuccessfulAnalysisProvider: 'gemini',
    activeByProvider: { gemini: SESSION_ID },
    sessions: [createAISessionSummary(session)],
    migration: {
      source: 'codex-sessions-v1',
      sourceHash: 'b'.repeat(64),
      completedAt: '2026-08-08T00:00:00.000Z',
    },
    updatedAt: session.lastUsedAt,
  };
}

describe('AI session clear storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retains an empty index and migration marker after deleting the active session', () => {
    const session = createSession();
    const index = createIndex(session);
    mockedReadAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });

    const updated = deleteAISession(
      'alice',
      index,
      session,
      () => new Date('2026-08-08T02:00:00.000Z'),
    );

    expect(updated).toEqual({
      ...index,
      lastSuccessfulAnalysisProvider: null,
      activeByProvider: {},
      sessions: [],
      updatedAt: '2026-08-08T02:00:00.000Z',
    });
    expect(mockedWriteAISessionIndex).toHaveBeenCalledWith('alice', updated);
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]sessions[\\/]gemini[\\/].+\.json$/),
    );
  });

  it('restores the index when local file deletion fails', () => {
    const session = createSession();
    const index = createIndex(session);
    mockedReadAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });
    const deletionError = new Error('permission denied');
    mockedFs.unlinkSync.mockImplementation(() => {
      throw deletionError;
    });

    expect(() => deleteAISession('alice', index, session)).toThrow(
      new AISessionPersistError('AI session file deletion failed: permission denied'),
    );
    expect(mockedWriteAISessionIndex).toHaveBeenLastCalledWith('alice', index);
  });

  it('reports both failures when the index cannot be restored', () => {
    const session = createSession();
    const index = createIndex(session);
    mockedReadAISessionStore.mockReturnValue({ status: 'valid', index, sessions: [session] });
    mockedFs.unlinkSync.mockImplementation(() => {
      throw new Error('permission denied');
    });
    mockedWriteAISessionIndex
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('rollback denied');
      });

    expect(() => deleteAISession('alice', index, session)).toThrow(
      new AISessionPersistError(
        'AI session file deletion failed (permission denied) and index rollback failed (rollback denied)',
      ),
    );
  });

  it('does not delete a session after the confirmed index changes', () => {
    const session = createSession();
    const index = createIndex(session);
    mockedReadAISessionStore.mockReturnValue({
      status: 'valid',
      index: { ...index, updatedAt: '2026-08-08T03:00:00.000Z' },
      sessions: [session],
    });

    expect(() => deleteAISession('alice', index, session)).toThrow(AISessionPersistError);
    expect(mockedWriteAISessionIndex).not.toHaveBeenCalled();
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });
});
