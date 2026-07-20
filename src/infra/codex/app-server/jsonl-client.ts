import type { Readable, Writable } from 'stream';
import { StringDecoder } from 'string_decoder';
import {
  CodexAppServerProtocolError,
  CodexAppServerRequestTimeoutError,
  CodexAppServerRpcError,
  CodexAppServerTransportError,
} from './errors';
import {
  isJsonRpcErrorResponse,
  isJsonRpcNotification,
  isJsonRpcServerRequest,
  parseJsonRpcIncomingMessage,
  type JsonRpcNotification,
  type JsonRpcOutgoingMessage,
  type JsonValue,
} from './protocol';

export type JsonResultDecoder<T> = (value: unknown) => T;
export type JsonRpcNotificationListener = (notification: JsonRpcNotification) => void;

export interface JsonlRpcClientOptions {
  defaultTimeoutMs: number;
  onNotification?: (notification: JsonRpcNotification) => void;
  onProtocolWarning?: (message: string) => void;
}

interface PendingRequest {
  timer: NodeJS.Timeout;
  resolveResult: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface NotificationSubscription {
  listener: JsonRpcNotificationListener;
}

/** Strict JSONL request client for a single Codex App Server stdio connection. */
export class JsonlRpcClient {
  private readonly input: Writable;
  private readonly output: Readable;
  private readonly options: JsonlRpcClientOptions;
  private readonly decoder = new StringDecoder('utf8');
  private readonly pending = new Map<number, PendingRequest>();
  private readonly notificationSubscriptions = new Set<NotificationSubscription>();
  private buffer = '';
  private nextRequestId = 1;
  private closed = false;

  constructor(input: Writable, output: Readable, options: JsonlRpcClientOptions) {
    this.input = input;
    this.output = output;
    this.options = options;
    if (options.onNotification) {
      this.notificationSubscriptions.add({ listener: options.onNotification });
    }
    output.on('data', this.handleData);
    output.once('end', this.handleEnd);
    output.once('error', this.handleOutputError);
    input.once('error', this.handleInputError);
  }

  /**
   * Sends a typed request and validates its result before resolving.
   * @param method - App Server method name.
   * @param params - JSON-compatible method parameters.
   * @param decode - Runtime validator for the method result.
   * @param timeoutMs - Optional request-specific deadline.
   * @returns The decoded method result.
   */
  request<T>(
    method: string,
    params: JsonValue | undefined,
    decode: JsonResultDecoder<T>,
    timeoutMs = this.options.defaultTimeoutMs,
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(
        new CodexAppServerTransportError('Codex App Server connection is closed'),
      );
    }

    const id = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexAppServerRequestTimeoutError(method, timeoutMs));
      }, timeoutMs);

      this.pending.set(id, {
        timer,
        resolveResult: (value) => {
          try {
            resolve(decode(value));
          } catch (error) {
            reject(
              error instanceof Error
                ? error
                : new CodexAppServerProtocolError(`Invalid result for "${method}"`),
            );
          }
        },
        reject,
      });
      this.writeMessage(
        {
          id,
          method,
          ...(params === undefined ? {} : { params }),
        },
        (error) => this.rejectPending(id, error),
      );
    });
  }

  /**
   * Sends a client notification as a one-way JSON-RPC message.
   * @param method - App Server notification method.
   * @param params - Optional JSON-compatible notification parameters.
   */
  notify(method: string, params?: JsonValue): void {
    this.writeMessage({ method, ...(params === undefined ? {} : { params }) });
  }

  /** Adds a notification listener and returns an idempotent unsubscribe callback. */
  subscribeNotifications(listener: JsonRpcNotificationListener): () => void {
    if (this.closed) {
      throw new CodexAppServerTransportError('Codex App Server connection is closed');
    }
    const subscription = { listener };
    this.notificationSubscriptions.add(subscription);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.notificationSubscriptions.delete(subscription);
    };
  }

  /** Rejects pending requests and removes stream listeners owned by this client. */
  dispose(reason = new CodexAppServerTransportError('Codex App Server connection closed')): void {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    this.rejectAll(reason);
  }

  private readonly handleData = (chunk: unknown): void => {
    if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk)) {
      this.fail(new CodexAppServerProtocolError('App Server stdout emitted a non-text chunk'));
      return;
    }

    this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    this.drainLines();
  };

  private readonly handleEnd = (): void => {
    this.buffer += this.decoder.end();
    if (this.buffer.trim() !== '') this.handleLine(this.buffer);
    this.buffer = '';
    this.fail(new CodexAppServerTransportError('Codex App Server stdout closed'));
  };

  private readonly handleOutputError = (error: Error): void => {
    this.fail(new CodexAppServerTransportError('Codex App Server stdout failed', error));
  };

  private readonly handleInputError = (error: Error): void => {
    this.fail(new CodexAppServerTransportError('Codex App Server stdin failed', error));
  };

  private drainLines(): void {
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/u, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.trim() !== '') this.handleLine(line);
      if (this.closed) return;
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch (error) {
      this.fail(
        new CodexAppServerProtocolError(`Invalid App Server JSONL response: ${String(error)}`),
      );
      return;
    }

    const message = parseJsonRpcIncomingMessage(value);
    if (!message) {
      this.fail(new CodexAppServerProtocolError('Invalid App Server message envelope'));
      return;
    }

    if (isJsonRpcServerRequest(message)) {
      this.options.onProtocolWarning?.(`Rejected App Server request: ${message.method}`);
      this.writeMessage({
        id: message.id,
        error: { code: -32601, message: 'Client does not support server requests' },
      });
      return;
    }

    if (isJsonRpcNotification(message)) {
      for (const { listener } of this.notificationSubscriptions) listener(message);
      return;
    }

    if (typeof message.id !== 'number') {
      this.options.onProtocolWarning?.('Ignored App Server response with a non-numeric id');
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      this.options.onProtocolWarning?.(`Ignored App Server response for request ${message.id}`);
      return;
    }

    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (isJsonRpcErrorResponse(message)) {
      pending.reject(
        new CodexAppServerRpcError(message.error.code, message.error.message, message.error.data),
      );
      return;
    }

    pending.resolveResult(message.result);
  }

  private writeMessage(message: JsonRpcOutgoingMessage, onError?: (error: Error) => void): void {
    if (this.closed) {
      onError?.(new CodexAppServerTransportError('Codex App Server connection is closed'));
      return;
    }

    const payload = `${JSON.stringify(message)}\n`;
    try {
      this.input.write(payload, 'utf8', (error?: Error | null) => {
        if (error) onError?.(new CodexAppServerTransportError('App Server write failed', error));
      });
    } catch (error) {
      onError?.(
        new CodexAppServerTransportError(
          'App Server write failed',
          error instanceof Error ? error : undefined,
        ),
      );
    }
  }

  private rejectPending(id: number, error: Error): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    pending.reject(error);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    this.rejectAll(error);
  }

  private detach(): void {
    this.output.off('data', this.handleData);
    this.output.off('end', this.handleEnd);
    this.output.off('error', this.handleOutputError);
    this.input.off('error', this.handleInputError);
    this.notificationSubscriptions.clear();
  }
}
