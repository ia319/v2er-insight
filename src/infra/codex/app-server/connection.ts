import packageJson from '../../../../package.json';
import {
  CodexAppServerProtocolError,
  CodexToolIsolationError,
  CodexUnexpectedTurnActionError,
} from './errors';
import {
  decodeAccountReadResponse,
  decodeInitializeResponse,
  decodeMcpServerStatusListResponse,
  decodeModelListResponse,
} from './method-decoders';
import {
  decodeThreadReadResponse,
  decodeThreadDeleteResponse,
  decodeThreadResumeResponse,
  decodeThreadSetNameResponse,
  decodeThreadStartResponse,
  decodeTurnInterruptResponse,
  decodeTurnStartResponse,
} from './thread-decoders';
import type {
  CodexAccountStatus,
  CodexMcpServerStatus,
  CodexMcpServerStatusPage,
  CodexModelInfo,
  CodexModelPage,
  CodexServerInfo,
} from './method-types';
import { decodeSessionNotification } from './notification-decoder';
import type { CodexSessionNotification } from './notification-types';
import type { JsonValue } from './protocol';
import {
  BASE_THREAD_CONFIG,
  buildToolIsolatedThreadConfig,
  CODEX_TOOL_PROBE_SERVICE_NAME,
  listAvailableMcpTools,
} from './tool-isolation';
import { isUnexpectedTurnAction } from './turn-action';
import type { CodexThreadInfo, CodexThreadSessionInfo, CodexTurnInfo } from './thread-types';
import { CodexTurnCompletionCollector } from './turn-completion';
import type {
  CodexAppServerExit,
  CodexAppServerProcess,
  CodexAppServerProcessOptions,
} from './process';
import { startCodexAppServer } from './process';
import type { CodexExecutableCandidate } from '../executable';

type AppServerProcessHandle = Pick<CodexAppServerProcess, 'client' | 'close'>;
type CodexItemStartedNotification = Extract<CodexSessionNotification, { kind: 'itemStarted' }>;
const MAX_MODEL_LIST_PAGES = 100;
const MAX_MCP_SERVER_LIST_PAGES = 100;

export interface CodexAppServerConnectionOptions {
  startupTimeoutMs: number;
}

export interface CodexThreadStartOptions {
  model: string;
  cwd: string;
}

export interface CodexThreadResumeOptions extends CodexThreadStartOptions {
  threadId: string;
}

export interface CodexTurnStartOptions {
  threadId: string;
  text: string;
  cwd: string;
  model: string;
  effort: string;
  clientUserMessageId?: string;
  outputSchema?: JsonValue;
}

export type CodexTurnStartedHandler = (turn: CodexTurnInfo) => void | Promise<void>;

function validateConnectionOptions(options: CodexAppServerConnectionOptions): void {
  if (!Number.isFinite(options.startupTimeoutMs) || options.startupTimeoutMs <= 0) {
    throw new RangeError('startupTimeoutMs must be a positive finite number');
  }
}

/** Initialized App Server methods used by provider discovery and sessions. */
export class CodexAppServerConnection {
  private readonly process: AppServerProcessHandle;
  private readonly startupTimeoutMs: number;
  private initialization?: Promise<CodexServerInfo>;

  constructor(processHandle: AppServerProcessHandle, options: CodexAppServerConnectionOptions) {
    validateConnectionOptions(options);
    this.process = processHandle;
    this.startupTimeoutMs = options.startupTimeoutMs;
  }

  /** Initializes the protocol once and sends the required client notification. */
  initialize(): Promise<CodexServerInfo> {
    this.initialization ??= this.performInitialize();
    return this.initialization;
  }

  /** Reads the account type and authentication availability state. */
  async readAccount(): Promise<CodexAccountStatus> {
    await this.initialize();
    return this.process.client.request(
      'account/read',
      { refreshToken: false },
      decodeAccountReadResponse,
    );
  }

  /** Reads visible models within bounded pagination and rejects cyclic cursors. */
  async listModels(): Promise<CodexModelInfo[]> {
    await this.initialize();
    const models: CodexModelInfo[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    let pageCount = 0;

    while (true) {
      if (pageCount >= MAX_MODEL_LIST_PAGES) {
        throw new CodexAppServerProtocolError(
          `model/list exceeded the maximum of ${MAX_MODEL_LIST_PAGES} pages`,
        );
      }
      pageCount += 1;
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

  /**
   * Reads the effective MCP tool inventory for one thread within bounded pagination.
   * @param threadId - Thread whose resolved MCP servers and tools are inspected.
   * @returns Validated MCP server and tool identities.
   */
  async listMcpServers(threadId: string): Promise<CodexMcpServerStatus[]> {
    await this.initialize();
    const servers: CodexMcpServerStatus[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    let pageCount = 0;

    while (true) {
      if (pageCount >= MAX_MCP_SERVER_LIST_PAGES) {
        throw new CodexAppServerProtocolError(
          `mcpServerStatus/list exceeded the maximum of ${MAX_MCP_SERVER_LIST_PAGES} pages`,
        );
      }
      pageCount += 1;
      const page: CodexMcpServerStatusPage = await this.process.client.request(
        'mcpServerStatus/list',
        {
          threadId,
          detail: 'toolsAndAuthOnly',
          ...(cursor === null ? {} : { cursor }),
        },
        decodeMcpServerStatusListResponse,
      );
      servers.push(...page.data);
      if (page.nextCursor === null) return servers;
      if (seenCursors.has(page.nextCursor)) {
        throw new CodexAppServerProtocolError(
          'mcpServerStatus/list returned a repeated pagination cursor',
        );
      }
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
  }

  /** Starts one persisted thread with explicit read-only execution settings. */
  async startThread(options: CodexThreadStartOptions): Promise<CodexThreadSessionInfo> {
    await this.initialize();
    const config = await this.createToolIsolatedThreadConfig(options);
    const session = await this.process.client.request(
      'thread/start',
      {
        model: options.model,
        cwd: options.cwd,
        config,
        approvalPolicy: 'never',
        sandbox: 'read-only',
        serviceName: 'v2er-insight',
        ephemeral: false,
      },
      decodeThreadStartResponse,
    );
    await this.assertNoMcpTools(session.thread.id);
    return session;
  }

  /** Resumes one persisted thread with the provider's read-only runtime settings. */
  async resumeThread(options: CodexThreadResumeOptions): Promise<CodexThreadSessionInfo> {
    await this.initialize();
    const config = await this.createToolIsolatedThreadConfig(options);
    const session = await this.process.client.request(
      'thread/resume',
      {
        threadId: options.threadId,
        model: options.model,
        cwd: options.cwd,
        config,
        approvalPolicy: 'never',
        sandbox: 'read-only',
      },
      decodeThreadResumeResponse,
    );
    await this.assertNoMcpTools(session.thread.id);
    return session;
  }

  /** Reads persisted thread state together with loaded turns. */
  async readThread(threadId: string): Promise<CodexThreadInfo> {
    await this.initialize();
    return this.process.client.request(
      'thread/read',
      { threadId, includeTurns: true },
      decodeThreadReadResponse,
    );
  }

  /** Sets the user-facing name of a thread. */
  async setThreadName(threadId: string, name: string): Promise<void> {
    await this.initialize();
    await this.process.client.request(
      'thread/name/set',
      { threadId, name },
      decodeThreadSetNameResponse,
    );
  }

  /** Permanently deletes one persisted thread through the supported App Server method. */
  async deleteThread(threadId: string): Promise<void> {
    await this.initialize();
    await this.process.client.request('thread/delete', { threadId }, decodeThreadDeleteResponse);
  }

  /** Starts one text turn with explicit model, effort, cwd, and read-only policy. */
  async startTurn(options: CodexTurnStartOptions): Promise<CodexTurnInfo> {
    await this.initialize();
    return this.process.client.request(
      'turn/start',
      {
        threadId: options.threadId,
        ...(options.clientUserMessageId === undefined
          ? {}
          : { clientUserMessageId: options.clientUserMessageId }),
        input: [{ type: 'text', text: options.text, text_elements: [] }],
        cwd: options.cwd,
        approvalPolicy: 'never',
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
        model: options.model,
        effort: options.effort,
        ...(options.outputSchema === undefined ? {} : { outputSchema: options.outputSchema }),
      },
      decodeTurnStartResponse,
    );
  }

  /**
   * Requests interruption of one active turn.
   * @param threadId - Owning thread identity.
   * @param turnId - Active turn identity.
   * @returns Completion after App Server accepts the interruption.
   */
  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.initialize();
    await this.process.client.request(
      'turn/interrupt',
      { threadId, turnId },
      decodeTurnInterruptResponse,
    );
  }

  /** Subscribes before starting a turn and waits for its terminal notification. */
  async runTurn(
    options: CodexTurnStartOptions,
    timeoutMs: number,
    onStarted?: CodexTurnStartedHandler,
  ): Promise<CodexTurnInfo> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive finite number');
    }

    const collector = new CodexTurnCompletionCollector(options.threadId);
    const bufferedActions = new Map<string, CodexItemStartedNotification>();
    let startedTurnId: string | undefined;
    let interruption: Promise<void> | undefined;
    const interruptUnexpectedAction = (action: CodexItemStartedNotification): void => {
      const error = new CodexUnexpectedTurnActionError(
        action.threadId,
        action.turnId,
        action.itemId,
        action.itemType,
      );
      collector.fail(error);
      interruption ??= this.interruptTurn(action.threadId, action.turnId);
      void interruption.catch(() => undefined);
    };
    const unsubscribe = this.subscribeSessionNotifications(
      (notification) => {
        if (
          notification.kind === 'itemStarted' &&
          notification.threadId === options.threadId &&
          isUnexpectedTurnAction(notification.itemType)
        ) {
          bufferedActions.set(notification.turnId, notification);
          if (notification.turnId === startedTurnId) interruptUnexpectedAction(notification);
          return;
        }
        collector.accept(notification);
      },
      (error) => collector.fail(error),
    );
    try {
      const started = await this.startTurn(options);
      startedTurnId = started.id;
      if (started.status !== 'inProgress') {
        throw new CodexAppServerProtocolError(
          `turn/start returned terminal status "${started.status}" for turn "${started.id}"`,
        );
      }
      const bufferedAction = bufferedActions.get(started.id);
      if (bufferedAction) interruptUnexpectedAction(bufferedAction);
      await onStarted?.(started);
      return await collector.waitFor(started.id, timeoutMs);
    } catch (error) {
      if (error instanceof CodexUnexpectedTurnActionError && interruption) {
        try {
          await interruption;
        } catch (interruptError) {
          throw new CodexUnexpectedTurnActionError(
            error.threadId,
            error.turnId,
            error.itemId,
            error.itemType,
            interruptError instanceof Error ? interruptError : new Error(String(interruptError)),
          );
        }
      }
      throw error;
    } finally {
      unsubscribe();
    }
  }

  /** Subscribes to decoded session notifications and reports decoder failures separately. */
  subscribeSessionNotifications(
    onNotification: (notification: CodexSessionNotification) => void,
    onError: (error: Error) => void,
  ): () => void {
    return this.process.client.subscribeNotifications((notification) => {
      try {
        const decoded = decodeSessionNotification(notification);
        if (decoded) onNotification(decoded);
      } catch (error) {
        onError(
          error instanceof Error
            ? error
            : new CodexAppServerProtocolError('Invalid App Server session notification'),
        );
      }
    });
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

  private async createToolIsolatedThreadConfig(
    options: CodexThreadStartOptions,
  ): Promise<JsonValue> {
    const probe = await this.process.client.request(
      'thread/start',
      {
        model: options.model,
        cwd: options.cwd,
        config: BASE_THREAD_CONFIG,
        approvalPolicy: 'never',
        sandbox: 'read-only',
        serviceName: CODEX_TOOL_PROBE_SERVICE_NAME,
        ephemeral: true,
      },
      decodeThreadStartResponse,
    );
    return buildToolIsolatedThreadConfig(await this.listMcpServers(probe.thread.id));
  }

  private async assertNoMcpTools(threadId: string): Promise<void> {
    const tools = listAvailableMcpTools(await this.listMcpServers(threadId));
    if (tools.length > 0) throw new CodexToolIsolationError(threadId, tools);
  }
}

/** Starts and wraps one initialized-capable App Server connection. */
export function connectCodexAppServer(
  candidate: CodexExecutableCandidate,
  processOptions: CodexAppServerProcessOptions,
  connectionOptions: CodexAppServerConnectionOptions,
): CodexAppServerConnection {
  validateConnectionOptions(connectionOptions);
  return new CodexAppServerConnection(
    startCodexAppServer(candidate, processOptions),
    connectionOptions,
  );
}
