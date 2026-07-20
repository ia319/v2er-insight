import fs from 'fs';
import path from 'path';
import type {
  CodexExecutableCandidate,
  CodexExecutableDiscoveryOptions,
  CodexExecutableKind,
  CodexExecutableSource,
} from './types';
import { getWindowsCodexProcessPaths } from './windows-processes';

interface CodexExecutableDiscoveryHost {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  cwd: string;
  processPaths: readonly string[];
  isFile: (filePath: string) => boolean;
}

function isExistingFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function getExecutableKind(filePath: string): CodexExecutableKind {
  return filePath.toLowerCase().endsWith('.cmd') ? 'command-shim' : 'native';
}

function getPathKey(filePath: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? filePath.toLowerCase() : filePath;
}

function getPathExecutableNames(platform: NodeJS.Platform): readonly string[] {
  return platform === 'win32' ? ['codex.exe', 'codex.cmd', 'codex'] : ['codex'];
}

/**
 * Collects Codex CLI candidates in selection priority order.
 * @param options - Explicit path and injectable host discovery inputs.
 * @returns Deduplicated executable candidates for subsequent protocol checks.
 */
export function collectCodexExecutables(
  options: CodexExecutableDiscoveryOptions,
  host: CodexExecutableDiscoveryHost,
): CodexExecutableCandidate[] {
  const { platform, env, cwd, processPaths, isFile } = host;
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const candidates: CodexExecutableCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (
    filePath: string,
    source: CodexExecutableSource,
    includeMissing = false,
  ): void => {
    const resolvedPath = pathApi.resolve(cwd, filePath);
    const key = getPathKey(resolvedPath, platform);
    if (seen.has(key) || (!includeMissing && !isFile(resolvedPath))) return;

    seen.add(key);
    candidates.push({
      path: resolvedPath,
      source,
      kind: getExecutableKind(resolvedPath),
    });
  };

  if (options.explicitPath?.trim()) {
    addCandidate(options.explicitPath.trim(), 'explicit', true);
  }

  if (platform === 'win32') {
    for (const processPath of processPaths) {
      const executableName = path.win32.basename(processPath).toLowerCase();
      if (executableName === 'codex.exe') {
        addCandidate(processPath, 'running-app-server');
      }
    }

    for (const processPath of processPaths) {
      if (path.win32.basename(processPath).toLowerCase() !== 'chatgpt.exe') continue;
      addCandidate(
        path.win32.join(path.win32.dirname(processPath), 'resources', 'codex.exe'),
        'app-bundle',
      );
    }
  }

  const pathValue = env.PATH ?? env.Path ?? '';
  const delimiter = platform === 'win32' ? ';' : ':';
  for (const rawDirectory of pathValue.split(delimiter)) {
    const directory = rawDirectory.trim().replace(/^"|"$/gu, '');
    if (directory === '') continue;

    for (const name of getPathExecutableNames(platform)) {
      addCandidate(pathApi.join(directory, name), 'path');
    }
  }

  return candidates;
}

/**
 * Discovers Codex CLI candidates from the active host environment.
 * @param options - Optional explicit executable path.
 * @returns Deduplicated executable candidates in selection priority order.
 */
export function discoverCodexExecutables(
  options: CodexExecutableDiscoveryOptions = {},
): CodexExecutableCandidate[] {
  const platform = process.platform;
  return collectCodexExecutables(options, {
    platform,
    env: process.env,
    cwd: process.cwd(),
    processPaths: platform === 'win32' ? getWindowsCodexProcessPaths() : [],
    isFile: isExistingFile,
  });
}
