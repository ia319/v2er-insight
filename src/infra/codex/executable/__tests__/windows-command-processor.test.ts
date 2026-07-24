import { describe, expect, it, vi } from 'vitest';
import { resolveWindowsCommandProcessorPath } from '../windows-command-processor';

describe('resolveWindowsCommandProcessorPath', () => {
  it('should resolve an existing executable from an absolute system root', () => {
    const isFile = vi.fn(() => true);

    expect(
      resolveWindowsCommandProcessorPath(
        { SystemRoot: 'C:\\Windows', ComSpec: 'D:\\attacker.exe' },
        isFile,
      ),
    ).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(isFile).toHaveBeenCalledOnce();
  });

  it.each([
    [{ SYSTEMROOT: 'C:\\Windows' }, 'C:\\Windows\\System32\\cmd.exe'],
    [{ windir: 'D:\\Windows' }, 'D:\\Windows\\System32\\cmd.exe'],
  ])('should resolve Windows environment variables case-insensitively', (env, expected) => {
    expect(resolveWindowsCommandProcessorPath(env, () => true)).toBe(expected);
  });

  it.each([
    ['a missing system root', {}],
    ['a relative system root', { SystemRoot: 'Windows' }],
  ])('should reject %s', (_case, env) => {
    expect(resolveWindowsCommandProcessorPath(env, () => true)).toBeNull();
  });

  it('should reject a missing executable', () => {
    expect(resolveWindowsCommandProcessorPath({ WINDIR: 'D:\\Windows' }, () => false)).toBeNull();
  });
});
