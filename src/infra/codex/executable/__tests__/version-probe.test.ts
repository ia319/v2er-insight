import { PassThrough } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodexCliExit, CodexCliProcess } from '../launcher';
import type { CodexExecutableCandidate } from '../types';

const mockedLaunchCodexCli = vi.hoisted(() => vi.fn());

vi.mock('../launcher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../launcher')>();
  return { ...actual, launchCodexCli: mockedLaunchCodexCli };
});

import {
  CodexVersionProbeError,
  probeCodexCliVersion,
  readCodexCliVersion,
} from '../version-probe';

const CANDIDATE: CodexExecutableCandidate = {
  path: 'C:\\App\\codex.exe',
  source: 'explicit',
  kind: 'native',
};

function createProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const terminate = vi.fn(() => true);
  let resolveExit: ((exit: CodexCliExit) => void) | undefined;
  const exit = new Promise<CodexCliExit>((resolve) => {
    resolveExit = resolve;
  });
  const handle: CodexCliProcess = { stdin, stdout, stderr, exit, terminate };
  return { handle, stdout, terminate, exitWith: (result: CodexCliExit) => resolveExit?.(result) };
}

describe('readCodexCliVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse the reported CLI version', async () => {
    const process = createProcess();
    const reading = readCodexCliVersion(process.handle, 1000);

    process.stdout.write('codex-cli 0.144.5\n');
    process.stdout.end();
    process.exitWith({ code: 0, signal: null });

    await expect(reading).resolves.toBe('0.144.5');
  });

  it('should reject unexpected version output', async () => {
    const process = createProcess();
    const reading = readCodexCliVersion(process.handle, 1000);

    process.stdout.end('unknown cli\n');
    process.exitWith({ code: 0, signal: null });

    await expect(reading).rejects.toMatchObject({
      code: 'invalid_output',
    } satisfies Partial<CodexVersionProbeError>);
  });

  it('should terminate the owned process after a timeout', async () => {
    vi.useFakeTimers();
    try {
      const process = createProcess();
      const reading = readCodexCliVersion(process.handle, 25);
      const rejection = expect(reading).rejects.toMatchObject({ code: 'timeout' });

      await vi.advanceTimersByTimeAsync(25);

      await rejection;
      expect(process.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('probeCodexCliVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject an invalid timeout before launching a process', async () => {
    await expect(probeCodexCliVersion(CANDIDATE, 0)).rejects.toThrow(
      'version probe timeout must be a positive finite number',
    );

    expect(mockedLaunchCodexCli).not.toHaveBeenCalled();
  });
});
