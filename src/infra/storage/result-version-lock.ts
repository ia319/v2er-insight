import { randomUUID } from 'node:crypto';
import fs from 'fs';
import { isResultDeliveryId } from '@/core/result-version/identifiers';
import { getResultVersionLockPath, getResultVersionsRootDir } from './result-version-paths';

const RESULT_VERSION_LOCK_SCHEMA_VERSION = 1 as const;

export interface ResultVersionLockOwner {
  schemaVersion: typeof RESULT_VERSION_LOCK_SCHEMA_VERSION;
  pid: number;
  acquiredAt: string;
  token: string;
}

export type ResultVersionLockState =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'locked'; owner: ResultVersionLockOwner };

/** Error raised when another process owns a user's result version write lock. */
export class ResultVersionLockBusyError extends Error {
  readonly lockPath: string;
  readonly state: Exclude<ResultVersionLockState, { status: 'missing' }>;

  constructor(lockPath: string, state: Exclude<ResultVersionLockState, { status: 'missing' }>) {
    const ownerDetails =
      state.status === 'locked'
        ? `Owner PID: ${state.owner.pid}; acquired at: ${state.owner.acquiredAt}. Remove the lock only after confirming the owner process has stopped.`
        : 'Lock owner data is invalid. Inspect the lock file before removing it.';
    super(
      `Result version writing is already running for this user. Lock file: "${lockPath}". ${ownerDetails}`,
    );
    this.name = 'ResultVersionLockBusyError';
    this.lockPath = lockPath;
    this.state = state;
  }
}

/** Error raised when result version lock ownership changes before release. */
export class ResultVersionLockOwnershipError extends Error {
  constructor() {
    super('Result version lock ownership changed before release');
    this.name = 'ResultVersionLockOwnershipError';
  }
}

/** Error raised when lock release fails after a result write attempt. */
export class ResultVersionLockReleaseError extends Error {
  readonly releaseError: unknown;
  readonly operationError?: unknown;

  constructor(releaseError: unknown, operationError?: unknown) {
    super('Result version lock could not be released');
    this.name = 'ResultVersionLockReleaseError';
    this.releaseError = releaseError;
    this.operationError = operationError;
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = new Date(value);
  return !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isResultVersionLockOwner(value: unknown): value is ResultVersionLockOwner {
  return (
    isRecord(value) &&
    Object.keys(value).length === 4 &&
    value.schemaVersion === RESULT_VERSION_LOCK_SCHEMA_VERSION &&
    Number.isSafeInteger(value.pid) &&
    (value.pid as number) > 0 &&
    isCanonicalTimestamp(value.acquiredAt) &&
    isResultDeliveryId(value.token)
  );
}

/**
 * Reads the current per-user result version write lock.
 *
 * @param username - V2EX username that owns the saved results.
 * @returns Missing, invalid, or validated lock state.
 */
export function readResultVersionLock(username: string): ResultVersionLockState {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(getResultVersionLockPath(username), 'utf-8'));
    return isResultVersionLockOwner(value)
      ? { status: 'locked', owner: value }
      : { status: 'invalid' };
  } catch (error) {
    return hasErrorCode(error, 'ENOENT') ? { status: 'missing' } : { status: 'invalid' };
  }
}

function acquireResultVersionLock(username: string): () => void {
  const lockPath = getResultVersionLockPath(username);
  const owner: ResultVersionLockOwner = {
    schemaVersion: RESULT_VERSION_LOCK_SCHEMA_VERSION,
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
    token: randomUUID(),
  };

  fs.mkdirSync(getResultVersionsRootDir(username), { recursive: true });
  let descriptor: number;
  try {
    descriptor = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) {
      const state = readResultVersionLock(username);
      throw new ResultVersionLockBusyError(
        lockPath,
        state.status === 'missing' ? { status: 'invalid' } : state,
      );
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
      // The acquisition error remains authoritative when the descriptor is already closed.
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // The acquisition error remains authoritative when lock cleanup also fails.
    }
    throw error;
  }

  return () => {
    const current = readResultVersionLock(username);
    if (current.status !== 'locked' || current.owner.token !== owner.token) {
      throw new ResultVersionLockOwnershipError();
    }
    fs.unlinkSync(lockPath);
  };
}

/**
 * Runs one synchronous operation under the per-user result version write lock.
 *
 * @param username - V2EX username that owns the saved results.
 * @param operation - Complete synchronous result version write transaction.
 * @returns The operation result after lock release.
 * @throws {ResultVersionLockBusyError} When another process owns the lock.
 * @throws {ResultVersionLockReleaseError} When ownership validation or release fails.
 * @throws A filesystem error or the original operation error.
 */
export function withResultVersionLock<T>(username: string, operation: () => T): T {
  const release = acquireResultVersionLock(username);
  let value: T;

  try {
    value = operation();
  } catch (operationError) {
    try {
      release();
    } catch (releaseError) {
      throw new ResultVersionLockReleaseError(releaseError, operationError);
    }
    throw operationError;
  }

  try {
    release();
  } catch (releaseError) {
    throw new ResultVersionLockReleaseError(releaseError);
  }
  return value;
}
