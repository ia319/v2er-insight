import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedSpawnSync = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({ spawnSync: mockedSpawnSync }));
vi.mock('../windows-powershell', () => ({
  resolveWindowsPowerShellPath: () =>
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
}));

import { getWindowsAuthenticodeSignatures } from '../windows-signature';

describe('getWindowsAuthenticodeSignatures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should decode bounded Authenticode results keyed by Windows path identity', () => {
    mockedSpawnSync.mockReturnValue({
      error: undefined,
      status: 0,
      stdout: JSON.stringify({
        items: [
          {
            path: 'C:\\App\\CODEX.exe',
            status: 'Valid',
            publisher: 'OpenAI OpCo, LLC',
          },
        ],
      }),
    });

    const signatures = getWindowsAuthenticodeSignatures(['C:\\App\\codex.exe'], {
      SystemRoot: 'C:\\Windows',
    });

    expect(signatures.get('c:\\app\\codex.exe')).toEqual({
      status: 'Valid',
      publisher: 'OpenAI OpCo, LLC',
    });
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      expect.any(Array),
      expect.objectContaining({
        shell: false,
        timeout: 10_000,
        env: expect.objectContaining({
          V2ER_CODEX_SIGNATURE_PATHS: '["C:\\\\App\\\\codex.exe"]',
        }),
      }),
    );
  });

  it.each([
    ['a launch error', { error: new Error('failed'), status: null, stdout: '' }],
    ['a non-zero exit', { error: undefined, status: 1, stdout: '{}' }],
    ['invalid JSON', { error: undefined, status: 0, stdout: 'invalid' }],
  ])('should return no signatures after %s', (_case, result) => {
    mockedSpawnSync.mockReturnValue(result);

    expect(getWindowsAuthenticodeSignatures(['C:\\App\\codex.exe'])).toEqual(new Map());
  });

  it('should skip process creation for an empty path set', () => {
    expect(getWindowsAuthenticodeSignatures([])).toEqual(new Map());
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });
});
