import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

vi.mock('node:fs');
vi.mock('node:crypto', () => ({ randomUUID: vi.fn() }));

import {
  acquireAISessionLockLease,
  AISessionIndexLockBusyError,
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

function lockOwner(token = LOCK_TOKEN, pid = process.pid, acquiredAt = ACQUIRED_AT): string {
  return JSON.stringify({ schemaVersion: 1, pid, acquiredAt, token });
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
    vi.restoreAllMocks();
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

  it('releases a manual lease at most once across layers', () => {
    const lease = acquireAISessionLockLease('alice', 'gemini', SESSION_ID);

    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
    lease.release();
    mockedFs.readFileSync.mockReturnValue(lockOwner('replacement-token'));
    expect(() => lease.release()).not.toThrow();

    expect(mockedFs.readFileSync).toHaveBeenCalledOnce();
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

  it('reclaims a dead process lock after confirming its owner token', () => {
    const deadPid = process.pid + 1_000;
    const abandonedOwner = lockOwner('abandoned-token', deadPid);
    mockedFs.openSync
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      })
      .mockReturnValueOnce(10);
    mockedFs.readFileSync
      .mockReturnValueOnce(abandonedOwner)
      .mockReturnValueOnce(abandonedOwner)
      .mockReturnValueOnce(lockOwner());
    const processKill = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('process not found'), { code: 'ESRCH' });
    });

    const lease = acquireAISessionLockLease('alice', 'gemini', SESSION_ID);
    lease.release();

    expect(processKill).toHaveBeenCalledWith(deadPid, 0);
    expect(mockedFs.openSync).toHaveBeenCalledTimes(2);
    expect(mockedFs.unlinkSync).toHaveBeenCalledTimes(2);
  });

  it('does not reclaim an old lock while its process is still running', () => {
    const livePid = process.pid + 1_000;
    mockedFs.openSync.mockImplementation(() => {
      throw Object.assign(new Error('exists'), { code: 'EEXIST' });
    });
    mockedFs.readFileSync.mockReturnValue(
      lockOwner(LOCK_TOKEN, livePid, '2020-01-01T00:00:00.000Z'),
    );
    const processKill = vi.spyOn(process, 'kill').mockReturnValue(true);

    expect(() => acquireAISessionLockLease('alice', 'gemini', SESSION_ID)).toThrow(
      AISessionLockBusyError,
    );

    expect(processKill).toHaveBeenCalledWith(livePid, 0);
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('does not reclaim a dead process lock after its owner token changes', () => {
    const deadPid = process.pid + 1_000;
    mockedFs.openSync.mockImplementation(() => {
      throw Object.assign(new Error('exists'), { code: 'EEXIST' });
    });
    mockedFs.readFileSync
      .mockReturnValueOnce(lockOwner('abandoned-token', deadPid))
      .mockReturnValueOnce(lockOwner('replacement-token', deadPid));
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('process not found'), { code: 'ESRCH' });
    });

    const error = (() => {
      try {
        acquireAISessionLockLease('alice', 'gemini', SESSION_ID);
      } catch (reason) {
        return reason;
      }
    })();

    expect(error).toMatchObject({
      state: { status: 'locked', owner: { token: 'replacement-token' } },
    });
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
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

  it('retries shared-index contention until the publication deadline', () => {
    mockedFs.openSync.mockImplementation(() => {
      throw Object.assign(new Error('exists'), { code: 'EEXIST' });
    });
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_500)
      .mockReturnValue(2_000);
    const wait = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');

    expect(() => withAISessionIndexTransaction('alice', () => undefined)).toThrow(
      AISessionIndexLockBusyError,
    );

    expect(mockedFs.openSync).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledOnce();
  });
});
