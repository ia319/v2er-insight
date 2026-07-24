import { describe, expect, it, vi } from 'vitest';
import { resolveWindowsPowerShellPath } from '../windows-powershell';

describe('resolveWindowsPowerShellPath', () => {
  it('should resolve an existing executable from an absolute system root', () => {
    const isFile = vi.fn(() => true);

    expect(resolveWindowsPowerShellPath({ SystemRoot: 'C:\\Windows' }, isFile)).toBe(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    );
    expect(isFile).toHaveBeenCalledOnce();
  });

  it.each([
    ['a missing system root', {}],
    ['a relative system root', { SystemRoot: 'Windows' }],
  ])('should reject %s', (_case, env) => {
    expect(resolveWindowsPowerShellPath(env, () => true)).toBeNull();
  });

  it('should reject a missing executable', () => {
    expect(resolveWindowsPowerShellPath({ WINDIR: 'D:\\Windows' }, () => false)).toBeNull();
  });
});
