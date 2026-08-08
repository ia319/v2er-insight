import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isLocalSessionId } from '@/core/ai/sessions/identifiers';
import type { AISessionProvider } from '@/core/ai/sessions/types';
import { getAISessionsRootDir } from './paths';

const SESSION_LOCK_SCHEMA_VERSION = 1;

interface AISessionLockOwner {
  schemaVersion: typeof SESSION_LOCK_SCHEMA_VERSION;
  pid: number;
  acquiredAt: string;
  token: string;
}

export type AISessionLockState =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'locked'; owner: AISessionLockOwner };

/** Reports that another process is updating the same provider session. */
export class AISessionLockBusyError extends Error {
  readonly state: Exclude<AISessionLockState, { status: 'missing' }>;

  constructor(state: Exclude<AISessionLockState, { status: 'missing' }>) {
    super('The selected AI session is already being updated');
    this.name = 'AISessionLockBusyError';
    this.state = state;
  }
}

/** Reports that lock ownership changed before the owner could release it. */
export class AISessionLockOwnershipError extends Error {
  constructor() {
    super('AI session lock ownership changed before release');
    this.name = 'AISessionLockOwnershipError';
  }
}

/** Preserves both an operation failure and a later lock release failure. */
export class AISessionLockReleaseError extends Error {
  readonly releaseError: unknown;
  readonly operationError?: unknown;

  constructor(releaseError: unknown, operationError?: unknown) {
    super('AI session lock could not be released');
    this.name = 'AISessionLockReleaseError';
    this.releaseError = releaseError;
    this.operationError = operationError;
  }
}

function getSessionLockPath(
  username: string,
  provider: AISessionProvider,
  localSessionId: string,
): string {
  if (!isLocalSessionId(localSessionId)) {
    throw new TypeError(`Invalid local AI session ID: ${localSessionId}`);
  }
  return path.join(getAISessionsRootDir(username), '.locks', provider, `${localSessionId}.lock`);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isLockOwner(value: unknown): value is AISessionLockOwner {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 4 &&
    record.schemaVersion === SESSION_LOCK_SCHEMA_VERSION &&
    typeof record.pid === 'number' &&
    Number.isSafeInteger(record.pid) &&
    record.pid > 0 &&
    isCanonicalTimestamp(record.acquiredAt) &&
    typeof record.token === 'string' &&
    record.token.trim() !== '' &&
    record.token.trim() === record.token
  );
}

/** Reads one session lock without changing it. */
export function readAISessionLock(
  username: string,
  provider: AISessionProvider,
  localSessionId: string,
): AISessionLockState {
  try {
    const value: unknown = JSON.parse(
      fs.readFileSync(getSessionLockPath(username, provider, localSessionId), 'utf-8'),
    );
    return isLockOwner(value) ? { status: 'locked', owner: value } : { status: 'invalid' };
  } catch (error) {
    return hasErrorCode(error, 'ENOENT') ? { status: 'missing' } : { status: 'invalid' };
  }
}

function acquireAISessionLock(
  username: string,
  provider: AISessionProvider,
  localSessionId: string,
): () => void {
  const lockPath = getSessionLockPath(username, provider, localSessionId);
  const owner: AISessionLockOwner = {
    schemaVersion: SESSION_LOCK_SCHEMA_VERSION,
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
    token: randomUUID(),
  };

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let descriptor: number;
  try {
    descriptor = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) {
      const state = readAISessionLock(username, provider, localSessionId);
      throw new AISessionLockBusyError(state.status === 'missing' ? { status: 'invalid' } : state);
    }
    throw error;
  }

  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(owner)}\n`, 'utf-8');
    fs.closeSync(descriptor);
  } catch (error) {
    try {
      fs.closeSync(descriptor);
    } catch {
      // The acquisition error remains authoritative after the descriptor closes.
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // The acquisition error remains authoritative when cleanup also fails.
    }
    throw error;
  }

  return () => {
    const current = readAISessionLock(username, provider, localSessionId);
    if (current.status === 'missing') return;
    if (current.status !== 'locked' || current.owner.token !== owner.token) {
      throw new AISessionLockOwnershipError();
    }
    fs.unlinkSync(lockPath);
  };
}

/** Runs one operation under a non-blocking provider-session lock. */
export async function withAISessionLock<T>(
  username: string,
  provider: AISessionProvider,
  localSessionId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const release = acquireAISessionLock(username, provider, localSessionId);
  const outcome = await operation().then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (reason: unknown) => ({ status: 'rejected' as const, reason }),
  );

  try {
    release();
  } catch (releaseError) {
    throw new AISessionLockReleaseError(
      releaseError,
      outcome.status === 'rejected' ? outcome.reason : undefined,
    );
  }

  if (outcome.status === 'rejected') throw outcome.reason;
  return outcome.value;
}
