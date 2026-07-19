import { describe, expect, it } from 'vitest';
import { createCodexLaunchSpec } from '../launcher';
import type { CodexExecutableCandidate } from '../types';

describe('createCodexLaunchSpec', () => {
  it('should launch native executables directly', () => {
    const candidate: CodexExecutableCandidate = {
      path: 'C:\\Program Files\\Codex\\codex.exe',
      source: 'app-bundle',
      kind: 'native',
    };

    expect(createCodexLaunchSpec(candidate, 'app-server', 'win32')).toEqual({
      command: candidate.path,
      args: ['app-server', '--listen', 'stdio://'],
      windowsVerbatimArguments: false,
    });
  });

  it('should use a fixed command processor invocation for Windows shims', () => {
    const candidate: CodexExecutableCandidate = {
      path: 'C:\\tools\\codex.cmd',
      source: 'path',
      kind: 'command-shim',
    };

    expect(createCodexLaunchSpec(candidate, 'version', 'win32', 'C:\\Windows\\cmd.exe')).toEqual({
      command: 'C:\\Windows\\cmd.exe',
      args: ['/d', '/s', '/c', '""C:\\tools\\codex.cmd" --version"'],
      windowsVerbatimArguments: true,
    });
  });

  it('should reject command shim paths with command expansion characters', () => {
    const candidate: CodexExecutableCandidate = {
      path: 'C:\\tools\\codex%PATH%.cmd',
      source: 'explicit',
      kind: 'command-shim',
    };

    expect(() => createCodexLaunchSpec(candidate, 'version', 'win32')).toThrow(
      'unsupported command characters',
    );
  });

  it('should require absolute executable paths', () => {
    const candidate: CodexExecutableCandidate = {
      path: 'codex.exe',
      source: 'explicit',
      kind: 'native',
    };

    expect(() => createCodexLaunchSpec(candidate, 'version', 'win32')).toThrow('must be absolute');
  });
});
