import { isDeepStrictEqual } from 'node:util';
import type {
  AISessionIndexV1,
  AISessionProvider,
  AISessionStateV1,
} from '@/core/ai/sessions/types';
import { createAISessionSummary } from '@/core/ai/sessions/summary';
import { isAISessionIndexV1, isAISessionStateV1 } from '@/core/ai/sessions/validator';
import { readJsonFileResult } from '../reader';
import { writeJsonFileAtomically } from '../writer';
import { getAISessionFilePath, getAISessionIndexPath } from './paths';

export type AISessionIndexReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; index: AISessionIndexV1 };

export type AISessionStateReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; session: AISessionStateV1 };

export type AISessionStoreReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; index: AISessionIndexV1; sessions: AISessionStateV1[] };

/** Reads and validates one user's AI session index. */
export function readAISessionIndex(username: string): AISessionIndexReadResult {
  const result = readJsonFileResult(getAISessionIndexPath(username));
  if (result.status !== 'success') return result;
  return isAISessionIndexV1(result.data)
    ? { status: 'valid', index: result.data }
    : { status: 'invalid' };
}

/** Reads one provider session and verifies its path identity. */
export function readAISessionState(
  username: string,
  provider: AISessionProvider,
  localSessionId: string,
): AISessionStateReadResult {
  const result = readJsonFileResult(getAISessionFilePath(username, provider, localSessionId));
  if (result.status !== 'success') return result;
  if (
    !isAISessionStateV1(result.data) ||
    result.data.username !== username ||
    result.data.provider !== provider ||
    result.data.localSessionId !== localSessionId
  ) {
    return { status: 'invalid' };
  }
  return { status: 'valid', session: result.data };
}

/**
 * Reads every indexed session and verifies that each summary matches its file.
 * @param username - Owner of the session store.
 * @returns The validated store or its missing/invalid state.
 */
export function readAISessionStore(username: string): AISessionStoreReadResult {
  const indexResult = readAISessionIndex(username);
  if (indexResult.status !== 'valid') return indexResult;

  const sessions: AISessionStateV1[] = [];
  for (const summary of indexResult.index.sessions) {
    const sessionResult = readAISessionState(username, summary.provider, summary.localSessionId);
    if (
      sessionResult.status !== 'valid' ||
      !isDeepStrictEqual(createAISessionSummary(sessionResult.session), summary)
    ) {
      return { status: 'invalid' };
    }
    sessions.push(sessionResult.session);
  }
  return { status: 'valid', index: indexResult.index, sessions };
}

/** Validates and atomically writes one provider-specific AI session. */
export function writeAISessionState(username: string, session: AISessionStateV1): void {
  if (!isAISessionStateV1(session) || session.username !== username) {
    throw new TypeError('AI session state is invalid or belongs to another user');
  }
  writeJsonFileAtomically(
    getAISessionFilePath(username, session.provider, session.localSessionId),
    session,
  );
}

/** Validates and atomically writes one user's AI session index. */
export function writeAISessionIndex(username: string, index: AISessionIndexV1): void {
  if (!isAISessionIndexV1(index)) {
    throw new TypeError('AI session index is invalid');
  }
  writeJsonFileAtomically(getAISessionIndexPath(username), index);
}
