import path from 'path';
import { describe, expect, it } from 'vitest';
import { classifyCodexExecutables, collectCodexExecutables } from '../discovery';
import { parseWindowsProcessPaths } from '../windows-processes';

describe('discoverCodexExecutables', () => {
  it('should make an explicit path the only discovered candidate', () => {
    const result = collectCodexExecutables(
      { explicitPath: 'C:\\custom\\codex.exe' },
      {
        platform: 'win32',
        cwd: 'C:\\work',
        env: { PATH: 'C:\\tools' },
        processPaths: ['C:\\App\\codex.exe', 'C:\\App\\ChatGPT.exe'],
        isFile: () => true,
      },
    );

    expect(result).toEqual([
      {
        path: 'C:\\custom\\codex.exe',
        source: 'explicit',
        kind: 'native',
      },
    ]);
  });

  it('should prioritize running, App bundle, and PATH candidates', () => {
    const existing = new Set(
      [
        'C:\\Program Files\\WindowsApps\\OpenAI.Codex_1\\app\\resources\\codex.exe',
        'C:\\Users\\test\\AppData\\Local\\OpenAI\\Codex\\bin\\hash\\codex.exe',
        'C:\\tools\\codex.cmd',
      ].map((value) => value.toLowerCase()),
    );

    const result = collectCodexExecutables(
      {},
      {
        platform: 'win32',
        cwd: 'C:\\work',
        env: { PATH: 'C:\\tools' },
        processPaths: [
          'C:\\Program Files\\WindowsApps\\OpenAI.Codex_1\\app\\ChatGPT.exe',
          'C:\\Users\\test\\AppData\\Local\\OpenAI\\Codex\\bin\\hash\\codex.exe',
        ],
        isFile: (filePath) => existing.has(filePath.toLowerCase()),
      },
    );

    expect(result).toEqual([
      {
        path: 'C:\\Users\\test\\AppData\\Local\\OpenAI\\Codex\\bin\\hash\\codex.exe',
        source: 'running-app-server',
        kind: 'native',
      },
      {
        path: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_1\\app\\resources\\codex.exe',
        source: 'app-bundle',
        kind: 'native',
      },
      {
        path: 'C:\\tools\\codex.cmd',
        source: 'path',
        kind: 'command-shim',
      },
    ]);
  });

  it('should retain the highest-priority source for duplicate Windows paths', () => {
    const executable = 'C:\\tools\\codex.exe';
    const result = collectCodexExecutables(
      {},
      {
        platform: 'win32',
        cwd: 'C:\\work',
        env: { PATH: 'C:\\TOOLS' },
        processPaths: [executable],
        isFile: () => true,
      },
    );

    expect(result[0]).toEqual({
      path: executable,
      source: 'running-app-server',
      kind: 'native',
    });
  });

  it('should resolve Unix PATH candidates with platform semantics', () => {
    const result = collectCodexExecutables(
      {},
      {
        platform: 'linux',
        cwd: '/work',
        env: { PATH: '/opt/codex:/usr/local/bin' },
        processPaths: [],
        isFile: (filePath) => filePath === '/opt/codex/codex',
      },
    );

    expect(result).toEqual([
      {
        path: path.posix.join('/opt/codex', 'codex'),
        source: 'path',
        kind: 'native',
      },
    ]);
  });

  it('should authorize only OpenAI-signed App candidates for automatic launch', () => {
    const running = {
      path: 'C:\\App\\running-codex.exe',
      source: 'running-app-server' as const,
      kind: 'native' as const,
    };
    const bundled = {
      path: 'C:\\App\\resources\\codex.exe',
      source: 'app-bundle' as const,
      kind: 'native' as const,
    };
    const pathCandidate = {
      path: 'C:\\tools\\codex.cmd',
      source: 'path' as const,
      kind: 'command-shim' as const,
    };
    const signatures = new Map([
      [running.path.toLowerCase(), { status: 'Valid', publisher: 'OpenAI OpCo, LLC' }] as const,
      [bundled.path.toLowerCase(), { status: 'Valid', publisher: 'Different Publisher' }] as const,
    ]);

    const result = classifyCodexExecutables([running, bundled, pathCandidate], 'win32', signatures);

    expect(result.launchCandidates).toEqual([running]);
    expect(result.observations).toEqual([
      {
        candidate: running,
        trust: {
          status: 'trusted',
          basis: 'windows-authenticode',
          publisher: 'OpenAI OpCo, LLC',
        },
      },
      {
        candidate: bundled,
        trust: {
          status: 'rejected',
          reason: 'publisher_mismatch',
          publisher: 'Different Publisher',
        },
      },
      {
        candidate: pathCandidate,
        trust: { status: 'manual_only', reason: 'explicit_path_required' },
      },
    ]);
  });

  it('should treat an explicit candidate as user-authorized without a signature', () => {
    const explicit = {
      path: 'C:\\tools\\codex.cmd',
      source: 'explicit' as const,
      kind: 'command-shim' as const,
    };

    expect(classifyCodexExecutables([explicit], 'win32')).toEqual({
      observations: [{ candidate: explicit, trust: { status: 'trusted', basis: 'explicit' } }],
      launchCandidates: [explicit],
    });
  });
});

describe('parseWindowsProcessPaths', () => {
  it('should trim and deduplicate process paths case-insensitively', () => {
    expect(parseWindowsProcessPaths('C:\\App\\codex.exe\r\nc:\\app\\CODEX.exe\r\n\r\n')).toEqual([
      'C:\\App\\codex.exe',
    ]);
  });
});
