import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import type { Readable, Writable } from 'stream';
import type { CodexExecutableCandidate } from './types';

export type CodexCliInvocation = 'version' | 'app-server';

interface CodexLaunchSpec {
  command: string;
  args: string[];
  windowsVerbatimArguments: boolean;
}

export interface CodexCliExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface CodexCliProcess {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  exit: Promise<CodexCliExit>;
  terminate(): boolean;
}

const INVOCATION_ARGS = {
  version: ['--version'],
  'app-server': ['app-server', '--listen', 'stdio://'],
} as const satisfies Record<CodexCliInvocation, readonly string[]>;

const UNSAFE_CMD_PATH_PATTERN = /[&|<>^%!"\r\n]/u;

/**
 * Builds a fixed Codex process invocation for native binaries or Windows command shims.
 * @param candidate - Discovered executable candidate.
 * @param invocation - Allowed fixed CLI operation.
 * @param platform - Target host platform.
 * @param commandProcessor - Windows command processor used for `.cmd` shims.
 * @returns Executable and argument vector for `spawn` with `shell: false`.
 */
export function createCodexLaunchSpec(
  candidate: CodexExecutableCandidate,
  invocation: CodexCliInvocation,
  platform = process.platform,
  commandProcessor = process.env.ComSpec ?? 'cmd.exe',
): CodexLaunchSpec {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  if (!pathApi.isAbsolute(candidate.path)) {
    throw new Error('Codex executable path must be absolute');
  }

  const args = [...INVOCATION_ARGS[invocation]];
  if (candidate.kind === 'native') {
    return { command: candidate.path, args, windowsVerbatimArguments: false };
  }

  if (platform !== 'win32') {
    throw new Error('Codex command shims are supported only on Windows');
  }

  if (UNSAFE_CMD_PATH_PATTERN.test(candidate.path)) {
    throw new Error('Codex command shim path contains unsupported command characters');
  }

  return {
    command: commandProcessor,
    args: ['/d', '/s', '/c', `""${candidate.path}" ${args.join(' ')}"`],
    windowsVerbatimArguments: true,
  };
}

/**
 * Starts a fixed Codex CLI operation with piped stdio.
 * @param candidate - Discovered executable candidate.
 * @param invocation - Allowed fixed CLI operation.
 * @returns The child process owned by the caller.
 */
export function spawnCodexCli(
  candidate: CodexExecutableCandidate,
  invocation: CodexCliInvocation,
): ChildProcessWithoutNullStreams {
  const launch = createCodexLaunchSpec(candidate, invocation);
  return spawn(launch.command, launch.args, {
    shell: false,
    windowsHide: true,
    windowsVerbatimArguments: launch.windowsVerbatimArguments,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * Starts a Codex CLI operation and exposes an owned lifecycle handle.
 * @param candidate - Discovered executable candidate.
 * @param invocation - Allowed fixed CLI operation.
 * @returns Piped streams, exit status, and termination for this child only.
 */
export function launchCodexCli(
  candidate: CodexExecutableCandidate,
  invocation: CodexCliInvocation,
): CodexCliProcess {
  const child = spawnCodexCli(candidate, invocation);
  const exit = new Promise<CodexCliExit>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });

  return {
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    exit,
    terminate: () => child.kill(),
  };
}
