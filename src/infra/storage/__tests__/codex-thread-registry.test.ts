import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedReadDataFileResult = vi.hoisted(() => vi.fn());
vi.mock('../reader', () => ({ readDataFileResult: mockedReadDataFileResult }));

import type { CodexThreadRegistryV1 } from '@/core/ai/providers/codex/thread-state';
import { readCodexThreadRegistry } from '../codex-thread-registry';

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
});
