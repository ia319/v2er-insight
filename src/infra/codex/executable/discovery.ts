import fs from 'fs';
import path from 'path';
import type {
  CodexExecutableCandidate,
  CodexExecutableDiscovery,
  CodexExecutableDiscoveryOptions,
  CodexExecutableKind,
  CodexExecutableObservation,
  CodexExecutableSource,
  CodexExecutableTrust,
} from './types';
import {
  getWindowsAuthenticodeSignatures,
  type WindowsAuthenticodeSignature,
} from './windows-signature';
import { getWindowsCodexProcessPaths } from './windows-processes';

const OPENAI_WINDOWS_PUBLISHERS = new Set(['OpenAI OpCo, LLC']);

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
    return candidates;
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

function classifyAutomaticTrust(
  candidate: CodexExecutableCandidate,
  platform: NodeJS.Platform,
  signatures: ReadonlyMap<string, WindowsAuthenticodeSignature>,
): CodexExecutableTrust {
  if (candidate.source === 'path') {
    return { status: 'manual_only', reason: 'explicit_path_required' };
  }
  if (platform !== 'win32' || candidate.kind !== 'native') {
    return { status: 'rejected', reason: 'signature_unavailable' };
  }

  const signature = signatures.get(candidate.path.toLowerCase());
  if (!signature) return { status: 'rejected', reason: 'signature_unavailable' };
  if (signature.status !== 'Valid') {
    return {
      status: 'rejected',
      reason: 'signature_invalid',
      ...(signature.publisher ? { publisher: signature.publisher } : {}),
    };
  }
  if (!signature.publisher || !OPENAI_WINDOWS_PUBLISHERS.has(signature.publisher)) {
    return {
      status: 'rejected',
      reason: 'publisher_mismatch',
      ...(signature.publisher ? { publisher: signature.publisher } : {}),
    };
  }
  return {
    status: 'trusted',
    basis: 'windows-authenticode',
    publisher: signature.publisher,
  };
}

/**
 * Applies explicit authorization and platform signature policy to discovered paths.
 * @param candidates - Discovered paths in runtime selection priority order.
 * @param platform - Host platform controlling automatic trust requirements.
 * @param signatures - Authenticode evidence keyed by case-insensitive Windows path.
 * @returns Diagnostic observations and the subset authorized for process launch.
 */
export function classifyCodexExecutables(
  candidates: readonly CodexExecutableCandidate[],
  platform: NodeJS.Platform,
  signatures: ReadonlyMap<string, WindowsAuthenticodeSignature> = new Map(),
): CodexExecutableDiscovery {
  const observations: CodexExecutableObservation[] = candidates.map((candidate) => ({
    candidate,
    trust:
      candidate.source === 'explicit'
        ? { status: 'trusted', basis: 'explicit' }
        : classifyAutomaticTrust(candidate, platform, signatures),
  }));
  return {
    observations,
    launchCandidates: observations
      .filter((observation) => observation.trust.status === 'trusted')
      .map((observation) => observation.candidate),
  };
}

/**
 * Discovers Codex CLI candidates from the active host environment.
 * @param options - Optional explicit executable path.
 * @returns Deduplicated executable candidates in selection priority order.
 */
export function discoverCodexExecutables(
  options: CodexExecutableDiscoveryOptions = {},
): CodexExecutableDiscovery {
  const platform = process.platform;
  const candidates = collectCodexExecutables(options, {
    platform,
    env: process.env,
    cwd: process.cwd(),
    processPaths: platform === 'win32' ? getWindowsCodexProcessPaths() : [],
    isFile: isExistingFile,
  });
  const automaticPaths = candidates
    .filter(
      (candidate) =>
        candidate.source !== 'explicit' &&
        candidate.source !== 'path' &&
        candidate.kind === 'native',
    )
    .map((candidate) => candidate.path);
  const signatures =
    platform === 'win32' ? getWindowsAuthenticodeSignatures(automaticPaths) : new Map();
  return classifyCodexExecutables(candidates, platform, signatures);
}
