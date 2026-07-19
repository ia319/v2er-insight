import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedReadDataFileResult = vi.hoisted(() => vi.fn());
const mockedWriteDataFile = vi.hoisted(() => vi.fn());

vi.mock('../reader', () => ({ readDataFileResult: mockedReadDataFileResult }));
vi.mock('../writer', () => ({ writeDataFile: mockedWriteDataFile }));

import type { CodexThreadRegistryV1 } from '@/core/ai/providers/codex/thread-state';
import {
  CodexThreadRegistryCorruptError,
  readCodexThreadRegistry,
  updateCodexThreadRegistry,
} from '../codex-thread-registry';

function createRegistry(): CodexThreadRegistryV1 {
  return { schemaVersion: 1, activeSessionId: null, sessions: [] };
}

describe('Codex thread registry storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should distinguish missing, invalid, and valid registries', () => {
    mockedReadDataFileResult.mockReturnValueOnce({ status: 'missing' });
    expect(readCodexThreadRegistry('alice')).toEqual({ status: 'missing' });

    mockedReadDataFileResult.mockReturnValueOnce({ status: 'invalid' });
    expect(readCodexThreadRegistry('alice')).toEqual({ status: 'invalid' });

    const registry = createRegistry();
    mockedReadDataFileResult.mockReturnValueOnce({ status: 'success', data: registry });
    expect(readCodexThreadRegistry('alice')).toEqual({ status: 'valid', registry });
  });

  it('should create and atomically persist a missing registry', () => {
    mockedReadDataFileResult.mockReturnValue({ status: 'missing' });
    const next = updateCodexThreadRegistry('alice', (registry) => registry);

    expect(next).toEqual(createRegistry());
    expect(mockedWriteDataFile).toHaveBeenCalledWith('alice', 'codexSessions', next);
  });

  it('should persist a valid registry update', () => {
    const registry = createRegistry();
    mockedReadDataFileResult.mockReturnValue({ status: 'success', data: registry });
    const next = updateCodexThreadRegistry('alice', (current) => ({ ...current }));

    expect(next).toEqual(registry);
    expect(mockedWriteDataFile).toHaveBeenCalledWith('alice', 'codexSessions', next);
  });

  it('should preserve an invalid existing registry', () => {
    mockedReadDataFileResult.mockReturnValue({ status: 'invalid' });

    expect(() => updateCodexThreadRegistry('alice', (registry) => registry)).toThrow(
      CodexThreadRegistryCorruptError,
    );
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
  });

  it('should reject invalid updater output before persistence', () => {
    mockedReadDataFileResult.mockReturnValue({ status: 'missing' });

    expect(() => updateCodexThreadRegistry('alice', () => ({ schemaVersion: 2 }))).toThrow(
      TypeError,
    );
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
  });
});
