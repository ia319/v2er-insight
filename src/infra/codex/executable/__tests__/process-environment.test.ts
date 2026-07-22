import { describe, expect, it } from 'vitest';
import { createCodexProcessEnvironment } from '../process-environment';
import type { CodexExecutableCandidate } from '../types';

const nativeCandidate: CodexExecutableCandidate = {
  path: 'C:\\App\\codex.exe',
  source: 'app-bundle',
  kind: 'native',
};

describe('createCodexProcessEnvironment', () => {
  it('should retain runtime, Codex home, proxy, and certificate variables', () => {
    const result = createCodexProcessEnvironment(
      nativeCandidate,
      {
        SystemRoot: 'C:\\Windows',
        USERPROFILE: 'C:\\Users\\test',
        LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
        TEMP: 'C:\\Temp',
        CODEX_HOME: 'D:\\CodexHome',
        CODEX_SQLITE_HOME: 'D:\\CodexState',
        HTTPS_PROXY: 'http://proxy.example',
        CODEX_CA_CERTIFICATE: 'C:\\certs\\codex.pem',
        SSL_CERT_FILE: 'C:\\certs\\root.pem',
      },
      'win32',
    );

    expect(result).toEqual({
      USERPROFILE: 'C:\\Users\\test',
      LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
      SystemRoot: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      CODEX_HOME: 'D:\\CodexHome',
      CODEX_SQLITE_HOME: 'D:\\CodexState',
      HTTPS_PROXY: 'http://proxy.example',
      CODEX_CA_CERTIFICATE: 'C:\\certs\\codex.pem',
      SSL_CERT_FILE: 'C:\\certs\\root.pem',
    });
  });

  it('should exclude API keys, process injection, PATH, and unrelated variables from native CLI', () => {
    const result = createCodexProcessEnvironment(
      nativeCandidate,
      {
        PATH: 'C:\\tools',
        GEMINI_API_KEY: 'gemini-secret',
        OPENAI_API_KEY: 'openai-secret',
        CODEX_ACCESS_TOKEN: 'codex-secret',
        NODE_OPTIONS: '--require malicious.js',
        NODE_EXTRA_CA_CERTS: 'C:\\certs\\node.pem',
        ComSpec: 'D:\\attacker.exe',
        APPLICATION_SECRET: 'application-secret',
      },
      'win32',
    );

    expect(result).toEqual({});
  });

  it('should read Windows variables case-insensitively into canonical keys', () => {
    const result = createCodexProcessEnvironment(
      nativeCandidate,
      { systemroot: 'C:\\Windows', codex_home: 'D:\\CodexHome' },
      'win32',
    );

    expect(result).toEqual({
      SystemRoot: 'C:\\Windows',
      CODEX_HOME: 'D:\\CodexHome',
    });
  });

  it('should retain PATH only for an explicitly authorized command shim', () => {
    const shimCandidate: CodexExecutableCandidate = {
      path: 'C:\\tools\\codex.cmd',
      source: 'explicit',
      kind: 'command-shim',
    };

    expect(
      createCodexProcessEnvironment(
        shimCandidate,
        { Path: 'C:\\node', PATHEXT: '.COM;.EXE;.CMD' },
        'win32',
      ),
    ).toEqual({ PATH: 'C:\\node', PATHEXT: '.COM;.EXE;.CMD' });
  });

  it('should retain lowercase proxy aliases on POSIX hosts', () => {
    expect(
      createCodexProcessEnvironment(
        { path: '/opt/codex', source: 'explicit', kind: 'native' },
        { HOME: '/home/test', https_proxy: 'http://proxy.example', Path: '/unrelated' },
        'linux',
      ),
    ).toEqual({ HOME: '/home/test', https_proxy: 'http://proxy.example' });
  });
});
