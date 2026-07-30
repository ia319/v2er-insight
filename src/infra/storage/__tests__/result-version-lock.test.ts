import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { randomUUID } from 'node:crypto';

vi.mock('fs');
vi.mock('node:crypto', () => ({ randomUUID: vi.fn() }));
vi.mock('../result-version-paths', () => ({
  getResultVersionLockPath: () => 'C:\\data\\alice\\results\\.write.lock',
  getResultVersionsRootDir: () => 'C:\\data\\alice\\results',
}));

import {
  readResultVersionLock,
  ResultVersionLockBusyError,
  ResultVersionLockOwnershipError,
  ResultVersionLockReleaseError,
  withResultVersionLock,
} from '../result-version-lock';

const mockedFs = vi.mocked(fs);
const mockedRandomUUID = vi.mocked(randomUUID);
const LOCK_TOKEN = '00000000-0000-4000-8000-000000000000';
const OTHER_TOKEN = '11111111-1111-4111-8111-111111111111';
const ACQUIRED_AT = '2026-07-26T08:00:00.000Z';

function lockOwner(token = LOCK_TOKEN): string {
  return JSON.stringify({ schemaVersion: 1, pid: process.pid, acquiredAt: ACQUIRED_AT, token });
}

describe('result version write lock', () => {
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

  it.each(['{', '{}'])('reports invalid lock contents for %s', (contents) => {
    mockedFs.readFileSync.mockReturnValue(contents);

    expect(readResultVersionLock('alice')).toEqual({ status: 'invalid' });
  });

  it('reports a missing lock only when the file does not exist', () => {
    mockedFs.readFileSync.mockImplementation(() => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    });

    expect(readResultVersionLock('alice')).toEqual({ status: 'missing' });
  });

  it('preserves filesystem errors while reading the lock', () => {
    const readError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    mockedFs.readFileSync.mockImplementation(() => {
      throw readError;
    });

    expect(() => readResultVersionLock('alice')).toThrow(readError);
  });

  it('holds the exclusive private lock through the complete write operation', () => {
    const operation = vi.fn(() => 'complete');

    expect(withResultVersionLock('alice', operation)).toBe('complete');

    expect(mockedFs.mkdirSync).toHaveBeenCalledWith('C:\\data\\alice\\results', {
      recursive: true,
    });
    expect(mockedFs.openSync).toHaveBeenCalledWith(
      'C:\\data\\alice\\results\\.write.lock',
      'wx',
      0o600,
    );
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(10, `${lockOwner()}\n`, 'utf-8');
    expect(operation).toHaveBeenCalledOnce();
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith('C:\\data\\alice\\results\\.write.lock');
  });

  it('reports the validated owner when the lock already exists', () => {
    mockedFs.openSync.mockImplementation(() => {
      throw Object.assign(new Error('exists'), { code: 'EEXIST' });
    });
    const operation = vi.fn();

    const error = (() => {
      try {
        withResultVersionLock('alice', operation);
        return null;
      } catch (reason) {
        return reason;
      }
    })();

    expect(error).toBeInstanceOf(ResultVersionLockBusyError);
    expect(error).toMatchObject({
      lockPath: 'C:\\data\\alice\\results\\.write.lock',
      state: {
        status: 'locked',
        owner: {
          pid: process.pid,
          acquiredAt: ACQUIRED_AT,
        },
      },
    });
    expect((error as Error).message).toContain(
      'Remove the lock only after confirming the owner process has stopped.',
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it('releases the lock and preserves an operation error', () => {
    const operationError = new Error('write failed');

    expect(() =>
      withResultVersionLock('alice', () => {
        throw operationError;
      }),
    ).toThrow(operationError);
    expect(mockedFs.unlinkSync).toHaveBeenCalledOnce();
  });

  it('preserves a replacement lock owned by another process', () => {
    mockedFs.readFileSync.mockReturnValue(lockOwner(OTHER_TOKEN));

    const error = (() => {
      try {
        withResultVersionLock('alice', () => 'complete');
        return null;
      } catch (reason) {
        return reason;
      }
    })();

    expect(error).toBeInstanceOf(ResultVersionLockReleaseError);
    expect((error as ResultVersionLockReleaseError).releaseError).toBeInstanceOf(
      ResultVersionLockOwnershipError,
    );
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('retains the operation error when lock release also fails', () => {
    const operationError = new Error('write failed');
    const releaseError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    mockedFs.unlinkSync.mockImplementation(() => {
      throw releaseError;
    });

    const error = (() => {
      try {
        withResultVersionLock('alice', () => {
          throw operationError;
        });
        return null;
      } catch (reason) {
        return reason;
      }
    })();

    expect(error).toBeInstanceOf(ResultVersionLockReleaseError);
    expect((error as ResultVersionLockReleaseError).operationError).toBe(operationError);
    expect((error as ResultVersionLockReleaseError).releaseError).toBe(releaseError);
  });
});
