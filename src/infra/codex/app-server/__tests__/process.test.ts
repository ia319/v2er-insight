import { PassThrough } from 'stream';
import { describe, expect, it, vi } from 'vitest';
import type { CodexCliExit, CodexCliProcess } from '../../executable';
import { CodexAppServerProcess } from '../process';

interface ProcessHarness {
  handle: CodexCliProcess;
  stderr: PassThrough;
  exitWith(exit: CodexCliExit): void;
  terminate: ReturnType<typeof vi.fn>;
}

function createProcessHarness(): ProcessHarness {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const terminate = vi.fn(() => true);
  let resolveExit: ((exit: CodexCliExit) => void) | undefined;
  const exit = new Promise<CodexCliExit>((resolve) => {
    resolveExit = resolve;
  });

  return {
    handle: { stdin, stdout, stderr, exit, terminate },
    stderr,
    exitWith: (result) => resolveExit?.(result),
    terminate,
  };
}

describe('CodexAppServerProcess', () => {
  it('should close stdin and preserve a graceful exit', async () => {
    const harness = createProcessHarness();
    const process = new CodexAppServerProcess(harness.handle, {
      requestTimeoutMs: 1000,
      shutdownGraceMs: 1000,
    });
    const stdinEnded = new Promise<void>((resolve) => harness.handle.stdin.once('finish', resolve));

    const closing = process.close();
    await stdinEnded;
    harness.exitWith({ code: 0, signal: null });

    await expect(closing).resolves.toMatchObject({ code: 0, forced: false });
    expect(harness.terminate).not.toHaveBeenCalled();
  });

  it('should terminate only the owned child after the shutdown grace period', async () => {
    vi.useFakeTimers();
    try {
      const harness = createProcessHarness();
      harness.terminate.mockImplementation(() => {
        harness.exitWith({ code: null, signal: 'SIGTERM' });
        return true;
      });
      const process = new CodexAppServerProcess(harness.handle, {
        requestTimeoutMs: 1000,
        shutdownGraceMs: 25,
      });

      const closing = process.close();
      const result = expect(closing).resolves.toMatchObject({ forced: true, signal: 'SIGTERM' });
      await vi.advanceTimersByTimeAsync(25);

      await result;
      expect(harness.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should bound stderr diagnostics to the configured limit', () => {
    const harness = createProcessHarness();
    const process = new CodexAppServerProcess(harness.handle, {
      requestTimeoutMs: 1000,
      shutdownGraceMs: 1000,
      stderrLimit: 5,
    });

    harness.stderr.write('123456789');

    expect(process.getStderr()).toBe('56789');
    harness.exitWith({ code: 0, signal: null });
  });

  it('should reject invalid timeout configuration', () => {
    const harness = createProcessHarness();

    expect(
      () =>
        new CodexAppServerProcess(harness.handle, {
          requestTimeoutMs: Number.NaN,
          shutdownGraceMs: 1000,
        }),
    ).toThrow('requestTimeoutMs must be a positive finite number');
    harness.exitWith({ code: 0, signal: null });
  });
});
