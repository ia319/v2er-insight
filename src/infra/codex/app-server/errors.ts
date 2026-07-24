export class CodexAppServerProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodexAppServerProtocolError';
  }
}

export class CodexToolIsolationError extends CodexAppServerProtocolError {
  readonly threadId: string;
  readonly tools: readonly string[];

  constructor(threadId: string, tools: readonly string[]) {
    super(`Codex thread "${threadId}" still exposes tools: ${tools.join(', ')}`);
    this.name = 'CodexToolIsolationError';
    this.threadId = threadId;
    this.tools = tools;
  }
}

export class CodexAppServerTransportError extends Error {
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'CodexAppServerTransportError';
    this.cause = cause;
  }
}

export class CodexAppServerRequestTimeoutError extends Error {
  readonly method: string;
  readonly timeoutMs: number;

  constructor(method: string, timeoutMs: number) {
    super(`Codex App Server request "${method}" timed out after ${timeoutMs} ms`);
    this.name = 'CodexAppServerRequestTimeoutError';
    this.method = method;
    this.timeoutMs = timeoutMs;
  }
}

export class CodexTurnWaitTimeoutError extends Error {
  readonly threadId: string;
  readonly turnId: string;
  readonly timeoutMs: number;

  constructor(threadId: string, turnId: string, timeoutMs: number) {
    super(`Codex turn "${turnId}" timed out after ${timeoutMs} ms`);
    this.name = 'CodexTurnWaitTimeoutError';
    this.threadId = threadId;
    this.turnId = turnId;
    this.timeoutMs = timeoutMs;
  }
}

export class CodexAppServerRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'CodexAppServerRpcError';
    this.code = code;
    this.data = data;
  }
}
