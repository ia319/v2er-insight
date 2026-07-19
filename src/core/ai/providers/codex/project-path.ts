import fs from 'fs';
import path from 'path';
import { getDataRootDir } from '@/infra/storage';

export type CodexProjectPathSource = 'cli' | 'config' | 'storage';

export interface ResolvedCodexProjectPath {
  path: string;
  source: CodexProjectPathSource;
}

export type CodexProjectPathErrorCode = 'missing' | 'not_directory' | 'unavailable';

export class CodexProjectPathError extends Error {
  readonly code: CodexProjectPathErrorCode;

  constructor(code: CodexProjectPathErrorCode, message: string) {
    super(message);
    this.name = 'CodexProjectPathError';
    this.code = code;
  }
}

/**
 * Compares normalized Codex Project paths with target-platform case semantics.
 * @param first - First normalized absolute path.
 * @param second - Second normalized absolute path.
 * @param platform - Platform that owns both paths.
 * @returns Whether both paths identify the same normalized Project location.
 */
export function areCodexProjectPathsEqual(
  first: string,
  second: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second;
}

function normalizePath(value: string, baseDir: string): string {
  const trimmed = value.trim();
  if (trimmed === '') throw new CodexProjectPathError('missing', 'Codex Project path is empty');
  return path.resolve(baseDir, trimmed);
}

/**
 * Resolves a new thread's Project path from CLI, Codex config, then the shared data root.
 * @param cliPath - Per-command Project override.
 * @param configPath - Persistent Codex Project override.
 * @param baseDir - Base directory for relative explicit paths.
 * @returns Normalized absolute path and its source.
 */
export function resolveCodexProjectPath(
  cliPath?: string,
  configPath?: string,
  baseDir = process.cwd(),
): ResolvedCodexProjectPath {
  if (cliPath !== undefined) {
    return { path: normalizePath(cliPath, baseDir), source: 'cli' };
  }
  if (configPath !== undefined) {
    return { path: normalizePath(configPath, baseDir), source: 'config' };
  }
  return { path: path.resolve(getDataRootDir()), source: 'storage' };
}

/**
 * Verifies that the resolved Project path is an existing directory.
 * @param projectPath - Normalized Project path.
 * @throws CodexProjectPathError when the path is missing, unreadable, or not a directory.
 */
export function assertCodexProjectDirectory(projectPath: string): void {
  try {
    const stats = fs.statSync(projectPath);
    if (!stats.isDirectory()) {
      throw new CodexProjectPathError(
        'not_directory',
        `Codex Project path is not a directory: ${projectPath}`,
      );
    }
  } catch (error) {
    if (error instanceof CodexProjectPathError) throw error;
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new CodexProjectPathError(
        'missing',
        `Codex Project directory does not exist: ${projectPath}`,
      );
    }
    throw new CodexProjectPathError(
      'unavailable',
      `Codex Project directory is unavailable: ${projectPath}`,
    );
  }
}
