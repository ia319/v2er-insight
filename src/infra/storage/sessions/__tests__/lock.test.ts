import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

vi.mock('node:fs');
vi.mock('node:crypto', () => ({ randomUUID: vi.fn() }));

import {
  acquireAISessionLockLease,
  AISessionLockBusyError,
  AISessionLockOwnershipError,
  AISessionLockReleaseError,
  withAISessionIndexTransaction,
  withAISessionLock,
} from '../lock';

const mockedFs = vi.mocked(fs);
const mockedRandomUUID = vi.mocked(randomUUID);
const LOCK_TOKEN = '00000000-0000-4000-8000-000000000000';
const ACQUIRED_AT = '2026-08-08T01:00:00.000Z';
const SESSION_ID = '6d8eea46-7e52-47ca-a740-34a0b01bb810';

function lockOwner(token = LOCK_TOKEN): string {
  return JSON.stringify({ schemaVersion: 1, pid: process.pid, acquiredAt: ACQUIRED_AT, token });
}

describe('AI session lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(ACQUIRED_AT));
    mockedRandomUUID.mockReturnValue(LOCK_TOKEN);
    mockedFs.openSync.mockReturnValue(10);
    mockedFs.readFileSync.mockReturnValue(lockOwner());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('scopes the lock to user, provider, and local session', async () => {
    await expect(
      withAISessionLock('alice', 'gemini', SESSION_ID, async () => 'complete'),
    ).resolves.toBe('complete');

    expect(mockedFs.openSync).toHaveBeenCalledWith(
      expect.stringMatching(
        /[\\/]\.locks[\\/]gemini[\\/]6d8eea46-7e52-47ca-a740-34a0b01bb810\.lock$/,
      ),
      'wx',
      0o600,
    );
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(10, `${lockOwner()}\n`, 'utf-8');
    expect(mockedFs.unlinkSync).toHaveBeenCalledOnce();
  });

  it('keeps a manual lease until its owner releases the cross-layer lifecycle', () => {
    const lease = acquireAISessionLockLease('alice', 'gemini', SESSION_ID);

    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
    lease.release();

    expect(mockedFs.unlinkSync).toHaveBeenCalledOnce();
  });

  it('does not run the operation when the selected session is locked', async () => {
    mockedFs.openSync.mockImplementation(() => {
      throw Object.assign(new Error('exists'), { code: 'EEXIST' });
    });
    const operation = vi.fn();

    const error = await withAISessionLock('alice', 'codex', SESSION_ID, operation).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(AISessionLockBusyError);
    expect(error).toMatchObject({ state: { status: 'locked', owner: { token: LOCK_TOKEN } } });
    expect(operation).not.toHaveBeenCalled();
  });

  it('preserves changed ownership and the operation failure on release errors', async () => {
    const operationError = new Error('turn failed');
    mockedFs.readFileSync.mockReturnValue(lockOwner('11111111-1111-4111-8111-111111111111'));

    const error = await withAISessionLock('alice', 'codex', SESSION_ID, () =>
      Promise.reject(operationError),
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(AISessionLockReleaseError);
    if (!(error instanceof AISessionLockReleaseError)) {
      throw new Error('Expected session lock release error');
    }
    expect(error.releaseError).toBeInstanceOf(AISessionLockOwnershipError);
    expect(error.operationError).toBe(operationError);
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('rejects path-like local session identities before filesystem access', async () => {
    await expect(
      withAISessionLock('alice', 'gemini', '..\\escape', async () => undefined),
    ).rejects.toThrow(TypeError);
    expect(mockedFs.openSync).not.toHaveBeenCalled();
  });

  it('serializes reentrant shared-index transactions with one file lock', () => {
    const result = withAISessionIndexTransaction('alice', () =>
      withAISessionIndexTransaction('alice', () => 'published'),
    );

    expect(result).toBe('published');
    expect(mockedFs.openSync).toHaveBeenCalledOnce();
    expect(mockedFs.openSync).toHaveBeenCalledWith(
      expect.stringMatching(/[\\/]\.locks[\\/]index\.lock$/),
      'wx',
      0o600,
    );
    expect(mockedFs.unlinkSync).toHaveBeenCalledOnce();
  });
});
