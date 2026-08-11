import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isLocalSessionId } from '@/core/ai/sessions/identifiers';
import type { AISessionProvider } from '@/core/ai/sessions/types';
import { getAISessionsRootDir } from './paths';

const SESSION_LOCK_SCHEMA_VERSION = 1;
const INDEX_LOCK_RETRY_MS = 10;
const INDEX_LOCK_TIMEOUT_MS = 1_000;
const INDEX_LOCK_WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

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

/** A verified provider-session lock that may span multiple persistence layers. */
export interface AISessionLockLease {
  /**
   * Releases the lock at most once and preserves an earlier failure if ownership changed.
   * @param operationError - Failure that occurred while the lease was held.
   */
  release(operationError?: unknown): void;
}

/** Reports that another process is updating the same provider session. */
export class AISessionLockBusyError extends Error {
  readonly state: Exclude<AISessionLockState, { status: 'missing' }>;

  constructor(state: Exclude<AISessionLockState, { status: 'missing' }>) {
    super('The selected AI session is already being updated');
    this.name = 'AISessionLockBusyError';
    this.state = state;
  }
}

/** Reports that the shared session index stayed busy past its short publication deadline. */
export class AISessionIndexLockBusyError extends Error {
  readonly state: Exclude<AISessionLockState, { status: 'missing' }>;

  constructor(state: Exclude<AISessionLockState, { status: 'missing' }>) {
    super('The shared AI session index is already being published');
    this.name = 'AISessionIndexLockBusyError';
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

function getSessionIndexLockPath(username: string): string {
  return path.join(getAISessionsRootDir(username), '.locks', 'index.lock');
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

function readLock(lockPath: string): AISessionLockState {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    return isLockOwner(value) ? { status: 'locked', owner: value } : { status: 'invalid' };
  } catch (error) {
    return hasErrorCode(error, 'ENOENT') ? { status: 'missing' } : { status: 'invalid' };
  }
}

function isProcessRunning(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !hasErrorCode(error, 'ESRCH');
  }
}

function tryReclaimAbandonedLock(lockPath: string, state: AISessionLockState): AISessionLockState {
  if (state.status !== 'locked' || isProcessRunning(state.owner.pid)) return state;

  // Recheck ownership immediately before deletion to avoid removing a replacement owner's lock.
  const confirmed = readLock(lockPath);
  if (confirmed.status !== 'locked' || confirmed.owner.token !== state.owner.token) {
    return confirmed;
  }

  try {
    fs.unlinkSync(lockPath);
    return { status: 'missing' };
  } catch (error) {
    return hasErrorCode(error, 'ENOENT') ? { status: 'missing' } : confirmed;
  }
}

/** Reads one session lock without changing it. */
export function readAISessionLock(
  username: string,
  provider: AISessionProvider,
  localSessionId: string,
): AISessionLockState {
  return readLock(getSessionLockPath(username, provider, localSessionId));
}

function acquireLock(
  lockPath: string,
  createBusyError: (
    state: Exclude<AISessionLockState, { status: 'missing' }>,
  ) => AISessionLockBusyError | AISessionIndexLockBusyError,
): () => void {
  const owner: AISessionLockOwner = {
    schemaVersion: SESSION_LOCK_SCHEMA_VERSION,
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
    token: randomUUID(),
  };

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let descriptor: number | undefined;
  let mayRetryAfterReclaim = true;
  while (descriptor === undefined) {
    try {
      descriptor = fs.openSync(lockPath, 'wx', 0o600);
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) throw error;
      const observed = readLock(lockPath);
      const current = mayRetryAfterReclaim ? tryReclaimAbandonedLock(lockPath, observed) : observed;
      if (mayRetryAfterReclaim && current.status === 'missing') {
        mayRetryAfterReclaim = false;
        continue;
      }
      throw createBusyError(current.status === 'missing' ? { status: 'invalid' } : current);
    }
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
    const current = readLock(lockPath);
    if (current.status === 'missing') return;
    if (current.status !== 'locked' || current.owner.token !== owner.token) {
      throw new AISessionLockOwnershipError();
    }
    fs.unlinkSync(lockPath);
  };
}

/**
 * Acquires a non-blocking provider-session lock for a lifecycle that crosses module boundaries.
 * @param username - Owner of the provider session.
 * @param provider - Provider that owns the local session.
 * @param localSessionId - Canonical local session identity.
 * @returns A lease whose release verifies lock ownership.
 * @throws {AISessionLockBusyError} When another process owns the selected session.
 */
export function acquireAISessionLockLease(
  username: string,
  provider: AISessionProvider,
  localSessionId: string,
): AISessionLockLease {
  const releaseLock = acquireLock(
    getSessionLockPath(username, provider, localSessionId),
    (state) => new AISessionLockBusyError(state),
  );
  let released = false;
  return {
    release(operationError?: unknown): void {
      if (released) return;
      try {
        releaseLock();
        released = true;
      } catch (releaseError) {
        throw new AISessionLockReleaseError(releaseError, operationError);
      }
    },
  };
}

const heldIndexLocks = new Set<string>();

function acquireAISessionIndexLock(lockPath: string): () => void {
  const deadline = Date.now() + INDEX_LOCK_TIMEOUT_MS;
  while (true) {
    try {
      return acquireLock(lockPath, (state) => new AISessionIndexLockBusyError(state));
    } catch (error) {
      if (!(error instanceof AISessionIndexLockBusyError) || Date.now() >= deadline) throw error;
      Atomics.wait(INDEX_LOCK_WAIT_BUFFER, 0, 0, INDEX_LOCK_RETRY_MS);
    }
  }
}

/**
 * Runs one synchronous read-modify-write publication under the shared per-user index lock.
 * @param username - Owner of the shared session index.
 * @param operation - Synchronous transaction that reads and publishes provider state.
 * @returns The transaction result after verified lock release.
 */
export function withAISessionIndexTransaction<T>(username: string, operation: () => T): T {
  const lockPath = getSessionIndexLockPath(username);
  if (heldIndexLocks.has(lockPath)) return operation();

  const release = acquireAISessionIndexLock(lockPath);
  heldIndexLocks.add(lockPath);
  const outcome = (() => {
    try {
      return { status: 'fulfilled' as const, value: operation() };
    } catch (reason) {
      return { status: 'rejected' as const, reason };
    }
  })();

  heldIndexLocks.delete(lockPath);
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

/** Runs one operation under a non-blocking provider-session lock. */
export async function withAISessionLock<T>(
  username: string,
  provider: AISessionProvider,
  localSessionId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lease = acquireAISessionLockLease(username, provider, localSessionId);
  const outcome = await Promise.resolve()
    .then(operation)
    .then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason: unknown) => ({ status: 'rejected' as const, reason }),
    );

  lease.release(outcome.status === 'rejected' ? outcome.reason : undefined);

  if (outcome.status === 'rejected') throw outcome.reason;
  return outcome.value;
}
