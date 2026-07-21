import { StringDecoder } from 'string_decoder';
import type { CodexCliExit, CodexCliProcess } from './launcher';
import { launchCodexCli } from './launcher';
import type { CodexExecutableCandidate } from './types';

export type CodexVersionProbeErrorCode = 'timeout' | 'process_failed' | 'invalid_output';

export class CodexVersionProbeError extends Error {
  readonly code: CodexVersionProbeErrorCode;

  constructor(code: CodexVersionProbeErrorCode, message: string) {
    super(message);
    this.name = 'CodexVersionProbeError';
    this.code = code;
  }
}

const VERSION_PATTERN = /^codex-cli\s+([^\r\n]+)$/u;
const OUTPUT_LIMIT = 4096;

function validateTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('version probe timeout must be a positive finite number');
  }
}

/** Reads and validates `codex --version` from one owned process. */
export async function readCodexCliVersion(
  processHandle: CodexCliProcess,
  timeoutMs: number,
): Promise<string> {
  validateTimeout(timeoutMs);
  const stdoutDecoder = new StringDecoder('utf8');
  let stdout = '';
  processHandle.stdout.on('data', (chunk: unknown) => {
    if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk)) return;
    const text = typeof chunk === 'string' ? chunk : stdoutDecoder.write(chunk);
    stdout = `${stdout}${text}`.slice(-OUTPUT_LIMIT);
  });
  processHandle.stdout.once('end', () => {
    stdout = `${stdout}${stdoutDecoder.end()}`.slice(-OUTPUT_LIMIT);
  });
  processHandle.stdin.end();

  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  let exit: CodexCliExit | null;
  try {
    exit = await Promise.race([processHandle.exit, timedOut]);
  } catch (error) {
    throw new CodexVersionProbeError(
      'process_failed',
      `Codex version process failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (exit === null) {
    processHandle.terminate();
    throw new CodexVersionProbeError(
      'timeout',
      `Codex version probe timed out after ${timeoutMs} ms`,
    );
  }
  if (exit.code !== 0) {
    throw new CodexVersionProbeError(
      'process_failed',
      `Codex version process exited with code ${String(exit.code)}`,
    );
  }

  const match = VERSION_PATTERN.exec(stdout.trim());
  const version = match?.[1]?.trim();
  if (!version) {
    throw new CodexVersionProbeError(
      'invalid_output',
      'Codex version output has an invalid format',
    );
  }
  return version;
}

/** Launches a candidate and returns its reported Codex CLI version. */
export async function probeCodexCliVersion(
  candidate: CodexExecutableCandidate,
  timeoutMs: number,
): Promise<string> {
  validateTimeout(timeoutMs);
  let processHandle: CodexCliProcess;
  try {
    processHandle = launchCodexCli(candidate, 'version');
  } catch (error) {
    throw new CodexVersionProbeError(
      'process_failed',
      `Codex version process failed to start: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return readCodexCliVersion(processHandle, timeoutMs);
}
