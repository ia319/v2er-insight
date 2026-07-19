import path from 'path';
import { describe, expect, it } from 'vitest';
import { collectCodexExecutables } from '../discovery';
import { parseWindowsProcessPaths } from '../windows-processes';

describe('discoverCodexExecutables', () => {
  it('should prioritize explicit, App, running, and PATH candidates', () => {
    const existing = new Set(
      [
        'C:\\Program Files\\WindowsApps\\OpenAI.Codex_1\\app\\resources\\codex.exe',
        'C:\\Users\\test\\AppData\\Local\\OpenAI\\Codex\\bin\\hash\\codex.exe',
        'C:\\tools\\codex.cmd',
      ].map((value) => value.toLowerCase()),
    );

    const result = collectCodexExecutables(
      { explicitPath: 'C:\\custom\\codex.exe' },
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
        path: 'C:\\custom\\codex.exe',
        source: 'explicit',
        kind: 'native',
      },
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
});

describe('parseWindowsProcessPaths', () => {
  it('should trim and deduplicate process paths case-insensitively', () => {
    expect(parseWindowsProcessPaths('C:\\App\\codex.exe\r\nc:\\app\\CODEX.exe\r\n\r\n')).toEqual([
      'C:\\App\\codex.exe',
    ]);
  });
});
