import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedSpawn = vi.hoisted(() => vi.fn());
const mockedResolveWindowsCommandProcessorPath = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({ spawn: mockedSpawn }));
vi.mock('../windows-command-processor', () => ({
  resolveWindowsCommandProcessorPath: mockedResolveWindowsCommandProcessorPath,
}));

import { createCodexLaunchSpec, spawnCodexCli } from '../launcher';
import type { CodexExecutableCandidate } from '../types';

describe('createCodexLaunchSpec', () => {
  beforeEach(() => {
    mockedSpawn.mockReset();
    mockedResolveWindowsCommandProcessorPath.mockReset();
    mockedResolveWindowsCommandProcessorPath.mockReturnValue('C:\\Windows\\System32\\cmd.exe');
  });

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

  it('should pass only the bounded environment to the child process', () => {
    const candidate: CodexExecutableCandidate = {
      path: 'C:\\Program Files\\Codex\\codex.exe',
      source: 'app-bundle',
      kind: 'native',
    };

    spawnCodexCli(
      candidate,
      'version',
      {},
      {
        SystemRoot: 'C:\\Windows',
        CODEX_HOME: 'D:\\CodexHome',
        GEMINI_API_KEY: 'secret',
        PATH: 'C:\\untrusted',
      },
      'win32',
    );

    expect(mockedSpawn).toHaveBeenCalledWith(
      candidate.path,
      ['--version'],
      expect.objectContaining({
        env: { SystemRoot: 'C:\\Windows', CODEX_HOME: 'D:\\CodexHome' },
        shell: false,
      }),
    );
  });

  it('should ignore inherited ComSpec when launching a command shim', () => {
    const candidate: CodexExecutableCandidate = {
      path: 'C:\\tools\\codex.cmd',
      source: 'explicit',
      kind: 'command-shim',
    };
    const sourceEnv = {
      SystemRoot: 'C:\\Windows',
      ComSpec: 'D:\\attacker.exe',
      PATH: 'C:\\node',
    };

    spawnCodexCli(candidate, 'version', {}, sourceEnv, 'win32');

    expect(mockedResolveWindowsCommandProcessorPath).toHaveBeenCalledWith(sourceEnv);
    expect(mockedSpawn).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\cmd.exe',
      ['/d', '/s', '/c', '""C:\\tools\\codex.cmd" --version"'],
      expect.objectContaining({
        env: { SystemRoot: 'C:\\Windows', PATH: 'C:\\node' },
        shell: false,
      }),
    );
  });

  it('should reject a command shim when the system processor is unavailable', () => {
    mockedResolveWindowsCommandProcessorPath.mockReturnValue(null);
    const candidate: CodexExecutableCandidate = {
      path: 'C:\\tools\\codex.cmd',
      source: 'explicit',
      kind: 'command-shim',
    };

    expect(() =>
      spawnCodexCli(candidate, 'version', {}, { SystemRoot: 'C:\\Windows' }, 'win32'),
    ).toThrow('Windows system command processor is unavailable');
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('should apply an explicit proxy to the bounded child environment', () => {
    const candidate: CodexExecutableCandidate = {
      path: 'C:\\Program Files\\Codex\\codex.exe',
      source: 'app-bundle',
      kind: 'native',
    };

    spawnCodexCli(
      candidate,
      'app-server',
      { proxyUrl: 'http://config-proxy.example' },
      {
        SystemRoot: 'C:\\Windows',
        HTTPS_PROXY: 'http://inherited-proxy.example',
        NO_PROXY: 'localhost',
      },
      'win32',
    );

    expect(mockedSpawn).toHaveBeenCalledWith(
      candidate.path,
      ['app-server', '--listen', 'stdio://'],
      expect.objectContaining({
        env: {
          SystemRoot: 'C:\\Windows',
          HTTP_PROXY: 'http://config-proxy.example',
          HTTPS_PROXY: 'http://config-proxy.example',
          NO_PROXY: 'localhost',
        },
        shell: false,
      }),
    );
  });
});
