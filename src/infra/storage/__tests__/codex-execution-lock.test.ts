import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { randomUUID } from 'node:crypto';

vi.mock('fs');
vi.mock('node:crypto', () => ({ randomUUID: vi.fn() }));

import {
  CodexExecutionLockBusyError,
  CodexExecutionLockOwnershipError,
  CodexExecutionLockReleaseError,
  withCodexExecutionLock,
} from '../codex-execution-lock';

const mockedFs = vi.mocked(fs);
const mockedRandomUUID = vi.mocked(randomUUID);
const LOCK_TOKEN = '00000000-0000-4000-8000-000000000000';
const ACQUIRED_AT = '2026-07-20T04:00:00.000Z';

function lockOwner(token = LOCK_TOKEN): string {
  return JSON.stringify({ schemaVersion: 1, pid: process.pid, acquiredAt: ACQUIRED_AT, token });
}

describe('Codex execution lock', () => {
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

  it('should hold the exclusive file through the complete operation', async () => {
    const operation = vi.fn().mockResolvedValue('complete');

    await expect(withCodexExecutionLock('alice', operation)).resolves.toBe('complete');

    expect(mockedFs.openSync).toHaveBeenCalledWith(
      expect.stringContaining('.codex-execution.lock'),
      'wx',
      0o600,
    );
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(10, `${lockOwner()}\n`, 'utf-8');
    expect(operation).toHaveBeenCalledOnce();
    expect(mockedFs.unlinkSync).toHaveBeenCalledWith(
      expect.stringContaining('.codex-execution.lock'),
    );
  });

  it('should report the validated owner when the lock already exists', async () => {
    mockedFs.openSync.mockImplementation(() => {
      throw Object.assign(new Error('exists'), { code: 'EEXIST' });
    });
    const operation = vi.fn();

    const error = await withCodexExecutionLock('alice', operation).catch(
      (reason: unknown) => reason,
    );

    expect(error).toMatchObject({
      name: 'CodexExecutionLockBusyError',
      state: { status: 'locked', owner: { pid: process.pid, token: LOCK_TOKEN } },
    });
    expect(operation).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(CodexExecutionLockBusyError);
  });

  it('should release the lock when the operation fails', async () => {
    const operationError = new Error('analysis failed');

    await expect(
      withCodexExecutionLock('alice', () => Promise.reject(operationError)),
    ).rejects.toBe(operationError);

    expect(mockedFs.unlinkSync).toHaveBeenCalledOnce();
  });

  it('should preserve a replacement lock owned by another process', async () => {
    mockedFs.readFileSync.mockReturnValue(lockOwner('11111111-1111-4111-8111-111111111111'));

    const error = await withCodexExecutionLock('alice', async () => 'complete').catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(CodexExecutionLockReleaseError);
    if (!(error instanceof CodexExecutionLockReleaseError)) {
      throw new Error('Expected lock release error');
    }
    expect(error.releaseError).toBeInstanceOf(CodexExecutionLockOwnershipError);
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('should retain the operation error when lock release also fails', async () => {
    const operationError = new Error('analysis failed');
    const releaseError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    mockedFs.unlinkSync.mockImplementation(() => {
      throw releaseError;
    });

    const error = await withCodexExecutionLock('alice', () => Promise.reject(operationError)).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(CodexExecutionLockReleaseError);
    if (!(error instanceof CodexExecutionLockReleaseError)) {
      throw new Error('Expected lock release error');
    }
    expect(error.operationError).toBe(operationError);
    expect(error.releaseError).toBe(releaseError);
  });
});
