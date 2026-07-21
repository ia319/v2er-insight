import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedSpawnSync = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({ spawnSync: mockedSpawnSync }));

import { getWindowsCodexProcessPaths } from '../windows-processes';

describe('getWindowsCodexProcessPaths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should apply a finite timeout and return unique process paths', () => {
    mockedSpawnSync.mockReturnValue({
      error: undefined,
      status: 0,
      stdout: 'C:\\App\\codex.exe\r\nc:\\app\\CODEX.exe\r\nC:\\App\\ChatGPT.exe\r\n',
    });

    expect(getWindowsCodexProcessPaths()).toEqual(['C:\\App\\codex.exe', 'C:\\App\\ChatGPT.exe']);
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'powershell.exe',
      expect.any(Array),
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it.each([
    [
      'a timeout',
      {
        error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }),
        status: null,
        stdout: '',
      },
    ],
    ['a launch error', { error: new Error('not found'), status: null, stdout: '' }],
    ['a non-zero exit', { error: undefined, status: 1, stdout: 'C:\\App\\codex.exe' }],
    ['non-text output', { error: undefined, status: 0, stdout: Buffer.from('invalid') }],
  ])('should return no paths after %s', (_case, result) => {
    mockedSpawnSync.mockReturnValue(result);

    expect(getWindowsCodexProcessPaths()).toEqual([]);
  });
});
