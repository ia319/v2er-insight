import { randomUUID } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { getUserDataDir } from './paths';

const CODEX_EXECUTION_LOCK_SCHEMA_VERSION = 1;
const CODEX_EXECUTION_LOCK_FILE = '.codex-execution.lock';

export interface CodexExecutionLockOwner {
  schemaVersion: typeof CODEX_EXECUTION_LOCK_SCHEMA_VERSION;
  pid: number;
  acquiredAt: string;
  token: string;
}

export type CodexExecutionLockState =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'locked'; owner: CodexExecutionLockOwner };

/** Error raised when another process owns a user's Codex execution lock. */
export class CodexExecutionLockBusyError extends Error {
  readonly state: Exclude<CodexExecutionLockState, { status: 'missing' }>;

  constructor(state: Exclude<CodexExecutionLockState, { status: 'missing' }>) {
    super('Codex analysis is already running for this user');
    this.name = 'CodexExecutionLockBusyError';
    this.state = state;
  }
}

/** Error raised for lock ownership changes before release. */
export class CodexExecutionLockOwnershipError extends Error {
  constructor() {
    super('Codex execution lock ownership changed before release');
    this.name = 'CodexExecutionLockOwnershipError';
  }
}

/** Error raised when releasing the lock fails after a completed operation attempt. */
export class CodexExecutionLockReleaseError extends Error {
  readonly releaseError: unknown;
  readonly operationError?: unknown;

  constructor(releaseError: unknown, operationError?: unknown) {
    super('Codex execution lock could not be released');
    this.name = 'CodexExecutionLockReleaseError';
    this.releaseError = releaseError;
    this.operationError = operationError;
  }
}

function getLockPath(username: string): string {
  return path.join(getUserDataDir(username), CODEX_EXECUTION_LOCK_FILE);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLockOwner(value: unknown): value is CodexExecutionLockOwner {
  if (!isUnknownRecord(value)) return false;
  const keys = Object.keys(value);
  if (
    keys.length !== 4 ||
    !keys.includes('schemaVersion') ||
    !keys.includes('pid') ||
    !keys.includes('acquiredAt') ||
    !keys.includes('token')
  ) {
    return false;
  }
  return (
    value.schemaVersion === CODEX_EXECUTION_LOCK_SCHEMA_VERSION &&
    typeof value.pid === 'number' &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 0 &&
    isCanonicalTimestamp(value.acquiredAt) &&
    typeof value.token === 'string' &&
    value.token.trim() === value.token &&
    value.token.length > 0
  );
}

/**
 * Reads the current per-user Codex execution lock.
 * @param username - V2EX user that owns the Codex session registry.
 * @returns Missing, invalid, or validated lock state.
 */
export function readCodexExecutionLock(username: string): CodexExecutionLockState {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(getLockPath(username), 'utf-8'));
    return isLockOwner(value) ? { status: 'locked', owner: value } : { status: 'invalid' };
  } catch (error) {
    return hasErrorCode(error, 'ENOENT') ? { status: 'missing' } : { status: 'invalid' };
  }
}

function acquireCodexExecutionLock(username: string): () => void {
  const dataDir = getUserDataDir(username);
  const lockPath = getLockPath(username);
  const owner: CodexExecutionLockOwner = {
    schemaVersion: CODEX_EXECUTION_LOCK_SCHEMA_VERSION,
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
    token: randomUUID(),
  };

  fs.mkdirSync(dataDir, { recursive: true });
  let descriptor: number;
  try {
    descriptor = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) {
      const state = readCodexExecutionLock(username);
      throw new CodexExecutionLockBusyError(
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
    const current = readCodexExecutionLock(username);
    if (current.status === 'missing') return;
    if (current.status !== 'locked' || current.owner.token !== owner.token) {
      throw new CodexExecutionLockOwnershipError();
    }
    fs.unlinkSync(lockPath);
  };
}

/**
 * Runs one operation under the per-user cross-process Codex execution lock.
 * @param username - V2EX user that owns the shared Codex registry and result state.
 * @param operation - Complete Codex analysis transaction guarded by the lock.
 * @returns The operation result after the lock has been released.
 * @throws CodexExecutionLockBusyError when another process owns the lock, or a filesystem error.
 */
export async function withCodexExecutionLock<T>(
  username: string,
  operation: () => Promise<T>,
): Promise<T> {
  const release = acquireCodexExecutionLock(username);
  const outcome = await operation().then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (reason: unknown) => ({ status: 'rejected' as const, reason }),
  );

  try {
    release();
  } catch (releaseError) {
    throw new CodexExecutionLockReleaseError(
      releaseError,
      outcome.status === 'rejected' ? outcome.reason : undefined,
    );
  }

  if (outcome.status === 'rejected') throw outcome.reason;
  return outcome.value;
}
