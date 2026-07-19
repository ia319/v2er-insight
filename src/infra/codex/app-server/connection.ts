import packageJson from '../../../../package.json';
import { CodexAppServerProtocolError } from './errors';
import {
  decodeAccountReadResponse,
  decodeInitializeResponse,
  decodeModelListResponse,
} from './method-decoders';
import type {
  CodexAccountStatus,
  CodexModelInfo,
  CodexModelPage,
  CodexServerInfo,
} from './method-types';
import type {
  CodexAppServerExit,
  CodexAppServerProcess,
  CodexAppServerProcessOptions,
} from './process';
import { startCodexAppServer } from './process';
import type { CodexExecutableCandidate } from '../executable';

type AppServerProcessHandle = Pick<CodexAppServerProcess, 'client' | 'close'>;

export interface CodexAppServerConnectionOptions {
  startupTimeoutMs: number;
}

/** Initialized App Server methods used by provider discovery and sessions. */
export class CodexAppServerConnection {
  private readonly process: AppServerProcessHandle;
  private readonly startupTimeoutMs: number;
  private initialization?: Promise<CodexServerInfo>;

  constructor(processHandle: AppServerProcessHandle, options: CodexAppServerConnectionOptions) {
    if (!Number.isFinite(options.startupTimeoutMs) || options.startupTimeoutMs <= 0) {
      throw new RangeError('startupTimeoutMs must be a positive finite number');
    }
    this.process = processHandle;
    this.startupTimeoutMs = options.startupTimeoutMs;
  }

  /** Initializes the protocol once and sends the required client notification. */
  initialize(): Promise<CodexServerInfo> {
    this.initialization ??= this.performInitialize();
    return this.initialization;
  }

  /** Reads authentication state without retaining account identity fields. */
  async readAccount(): Promise<CodexAccountStatus> {
    await this.initialize();
    return this.process.client.request(
      'account/read',
      { refreshToken: false },
      decodeAccountReadResponse,
    );
  }

  /** Reads every visible model page and rejects cyclic pagination cursors. */
  async listModels(): Promise<CodexModelInfo[]> {
    await this.initialize();
    const models: CodexModelInfo[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;

    while (true) {
      const page: CodexModelPage = await this.process.client.request(
        'model/list',
        cursor === null ? { includeHidden: false } : { cursor, includeHidden: false },
        decodeModelListResponse,
      );
      models.push(...page.data);
      if (page.nextCursor === null) return models;
      if (seenCursors.has(page.nextCursor)) {
        throw new CodexAppServerProtocolError('model/list returned a repeated pagination cursor');
      }
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
  }

  /** Closes the owned App Server process. */
  close(): Promise<CodexAppServerExit> {
    return this.process.close();
  }

  private async performInitialize(): Promise<CodexServerInfo> {
    const result = await this.process.client.request(
      'initialize',
      {
        clientInfo: {
          name: 'v2er-insight',
          title: 'v2er-insight',
          version: packageJson.version,
        },
        capabilities: {
          experimentalApi: false,
          requestAttestation: false,
        },
      },
      decodeInitializeResponse,
      this.startupTimeoutMs,
    );
    this.process.client.notify('initialized');
    return result;
  }
}

/** Starts and wraps one initialized-capable App Server connection. */
export function connectCodexAppServer(
  candidate: CodexExecutableCandidate,
  processOptions: CodexAppServerProcessOptions,
  connectionOptions: CodexAppServerConnectionOptions,
): CodexAppServerConnection {
  return new CodexAppServerConnection(
    startCodexAppServer(candidate, processOptions),
    connectionOptions,
  );
}
