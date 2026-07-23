import { StringDecoder } from 'string_decoder';
import type { CodexExecutableCandidate } from '../executable';
import { launchCodexCli, type CodexCliExit, type CodexCliProcess } from '../executable';
import { CodexAppServerTransportError } from './errors';
import { JsonlRpcClient } from './jsonl-client';
import type { JsonRpcNotification } from './protocol';

const DEFAULT_STDERR_LIMIT = 16_384;

export interface CodexAppServerProcessOptions {
  requestTimeoutMs: number;
  shutdownGraceMs: number;
  proxyUrl?: string;
  stderrLimit?: number;
  onNotification?: (notification: JsonRpcNotification) => void;
  onProtocolWarning?: (message: string) => void;
}

export interface CodexAppServerExit extends CodexCliExit {
  forced: boolean;
  stderr: string;
}

const TIMEOUT = Symbol('timeout');

async function waitWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T | typeof TIMEOUT> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function validateOptions(options: CodexAppServerProcessOptions): void {
  for (const [name, value] of [
    ['requestTimeoutMs', options.requestTimeoutMs],
    ['shutdownGraceMs', options.shutdownGraceMs],
    ['stderrLimit', options.stderrLimit ?? DEFAULT_STDERR_LIMIT],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number`);
    }
  }
}

/** Owns one short-lived Codex App Server child and its JSONL connection. */
export class CodexAppServerProcess {
  readonly client: JsonlRpcClient;
  private readonly process: CodexCliProcess;
  private readonly shutdownGraceMs: number;
  private readonly stderrLimit: number;
  private readonly stderrDecoder = new StringDecoder('utf8');
  private stderr = '';
  private closePromise?: Promise<CodexAppServerExit>;

  constructor(processHandle: CodexCliProcess, options: CodexAppServerProcessOptions) {
    validateOptions(options);
    this.process = processHandle;
    this.shutdownGraceMs = options.shutdownGraceMs;
    this.stderrLimit = options.stderrLimit ?? DEFAULT_STDERR_LIMIT;
    this.client = new JsonlRpcClient(processHandle.stdin, processHandle.stdout, {
      defaultTimeoutMs: options.requestTimeoutMs,
      onNotification: options.onNotification,
      onProtocolWarning: options.onProtocolWarning,
    });

    processHandle.stderr.on('data', this.handleStderr);
    processHandle.stderr.once('end', this.handleStderrEnd);
    void processHandle.exit.then(
      () => this.client.dispose(new CodexAppServerTransportError('Codex App Server exited')),
      (error: unknown) =>
        this.client.dispose(
          new CodexAppServerTransportError(
            'Codex App Server process failed',
            error instanceof Error ? error : undefined,
          ),
        ),
    );
  }

  /** Returns bounded stderr captured for diagnostics. */
  getStderr(): string {
    return this.stderr;
  }

  /** Ends stdin, waits for graceful exit, then terminates only this owned child on timeout. */
  close(): Promise<CodexAppServerExit> {
    this.closePromise ??= this.performClose();
    return this.closePromise;
  }

  private readonly handleStderr = (chunk: unknown): void => {
    if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk)) return;
    const text = typeof chunk === 'string' ? chunk : this.stderrDecoder.write(chunk);
    this.stderr = `${this.stderr}${text}`.slice(-this.stderrLimit);
  };

  private readonly handleStderrEnd = (): void => {
    this.stderr = `${this.stderr}${this.stderrDecoder.end()}`.slice(-this.stderrLimit);
  };

  private async performClose(): Promise<CodexAppServerExit> {
    this.client.dispose(new CodexAppServerTransportError('Codex App Server is shutting down'));
    this.process.stdin.end();

    const gracefulExit = await waitWithin(this.process.exit, this.shutdownGraceMs);
    if (gracefulExit !== TIMEOUT) return this.toExit(gracefulExit, false);

    this.process.terminate();
    const forcedExit = await waitWithin(this.process.exit, this.shutdownGraceMs);
    return forcedExit === TIMEOUT
      ? { code: null, signal: null, forced: true, stderr: this.stderr }
      : this.toExit(forcedExit, true);
  }

  private toExit(exit: CodexCliExit, forced: boolean): CodexAppServerExit {
    return { ...exit, forced, stderr: this.stderr };
  }
}

/**
 * Starts an owned stdio App Server process for a selected CLI candidate.
 * @param candidate - Capability-selected Codex CLI executable.
 * @param options - Request, shutdown, environment, notification, and diagnostic settings.
 * @returns The process owner and JSONL client.
 */
export function startCodexAppServer(
  candidate: CodexExecutableCandidate,
  options: CodexAppServerProcessOptions,
): CodexAppServerProcess {
  validateOptions(options);
  const processHandle = launchCodexCli(
    candidate,
    'app-server',
    options.proxyUrl ? { proxyUrl: options.proxyUrl } : {},
  );
  try {
    return new CodexAppServerProcess(processHandle, options);
  } catch (error) {
    try {
      processHandle.terminate();
    } catch {
      // Preserve the construction error when best-effort termination also fails.
    }
    throw error;
  }
}
