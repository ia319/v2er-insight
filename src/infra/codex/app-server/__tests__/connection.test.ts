import { PassThrough } from 'stream';
import { describe, expect, it, vi } from 'vitest';
import { JsonlRpcClient } from '../jsonl-client';
import { CodexAppServerConnection } from '../connection';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createHarness() {
  const input = new PassThrough();
  const output = new PassThrough();
  const client = new JsonlRpcClient(input, output, { defaultTimeoutMs: 1000 });
  const requests: Array<Record<string, unknown>> = [];
  let buffer = '';

  input.setEncoding('utf8');
  input.on('data', (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      const value = JSON.parse(line) as unknown;
      if (!isRecord(value)) throw new Error('Expected request object');
      requests.push(value);
      newline = buffer.indexOf('\n');
    }
  });

  const close = vi.fn(async () => ({
    code: 0,
    signal: null,
    forced: false,
    stderr: '',
  }));
  const connection = new CodexAppServerConnection({ client, close }, { startupTimeoutMs: 1000 });

  return { connection, output, requests };
}

const initializeResult = {
  userAgent: 'codex_cli_rs/0.144.5',
  codexHome: 'C:\\Users\\test\\.codex',
  platformFamily: 'windows',
  platformOs: 'windows',
};

describe('CodexAppServerConnection', () => {
  it('should initialize once before reading account state', async () => {
    const { connection, output, requests } = createHarness();
    const first = connection.initialize();
    output.write(`${JSON.stringify({ id: 1, result: initializeResult })}\n`);

    await expect(first).resolves.toEqual(initializeResult);
    await expect(connection.initialize()).resolves.toEqual(initializeResult);
    expect(requests.filter((request) => request.method === 'initialize')).toHaveLength(1);
    expect(requests).toContainEqual({ method: 'initialized' });

    const account = connection.readAccount();
    await vi.waitFor(() => {
      expect(requests.some((request) => request.method === 'account/read')).toBe(true);
    });
    output.write(
      `${JSON.stringify({
        id: 2,
        result: {
          account: { type: 'chatgpt', email: 'private@example.com' },
          requiresOpenaiAuth: true,
        },
      })}\n`,
    );
    await expect(account).resolves.toEqual({ accountType: 'chatgpt', requiresOpenaiAuth: true });
    await connection.close();
  });

  it('should collect paginated visible models', async () => {
    const { connection, output, requests } = createHarness();
    const listing = connection.listModels();
    output.write(`${JSON.stringify({ id: 1, result: initializeResult })}\n`);
    await vi.waitFor(() => {
      expect(requests.filter((request) => request.method === 'model/list')).toHaveLength(1);
    });
    output.write(
      `${JSON.stringify({ id: 2, result: { data: [createModel('model-a')], nextCursor: 'next' } })}\n`,
    );
    await vi.waitFor(() => {
      expect(requests.filter((request) => request.method === 'model/list')).toHaveLength(2);
    });
    output.write(
      `${JSON.stringify({ id: 3, result: { data: [createModel('model-b')], nextCursor: null } })}\n`,
    );

    await expect(listing).resolves.toMatchObject([{ model: 'model-a' }, { model: 'model-b' }]);
    expect(requests).toContainEqual({
      id: 3,
      method: 'model/list',
      params: { cursor: 'next', includeHidden: false },
    });
    await connection.close();
  });

  it('should start and name persisted read-only threads', async () => {
    const { connection, output, requests } = createHarness();
    const starting = connection.startThread({ model: 'gpt-current', cwd: 'D:\\data' });
    output.write(`${JSON.stringify({ id: 1, result: initializeResult })}\n`);
    await vi.waitFor(() => {
      expect(requests.some((request) => request.method === 'thread/start')).toBe(true);
    });
    output.write(`${JSON.stringify({ id: 2, result: createThreadSessionResult() })}\n`);

    await expect(starting).resolves.toMatchObject({
      thread: { id: 'thread-1' },
      model: 'gpt-current',
    });
    expect(requests).toContainEqual({
      id: 2,
      method: 'thread/start',
      params: {
        model: 'gpt-current',
        cwd: 'D:\\data',
        approvalPolicy: 'never',
        sandbox: 'read-only',
        serviceName: 'v2er-insight',
        ephemeral: false,
      },
    });

    const naming = connection.setThreadName('thread-1', 'alice-insight');
    await vi.waitFor(() => {
      expect(requests.some((request) => request.method === 'thread/name/set')).toBe(true);
    });
    output.write(`${JSON.stringify({ id: 3, result: {} })}\n`);
    await expect(naming).resolves.toBeUndefined();
    await connection.close();
  });

  it('should resume and read threads with persisted turns', async () => {
    const { connection, output, requests } = createHarness();
    const resuming = connection.resumeThread({
      threadId: 'thread-1',
      model: 'gpt-current',
      cwd: 'D:\\data',
    });
    output.write(`${JSON.stringify({ id: 1, result: initializeResult })}\n`);
    await vi.waitFor(() => {
      expect(requests.some((request) => request.method === 'thread/resume')).toBe(true);
    });
    output.write(`${JSON.stringify({ id: 2, result: createThreadSessionResult() })}\n`);
    await expect(resuming).resolves.toMatchObject({ thread: { id: 'thread-1' } });
    expect(requests).toContainEqual({
      id: 2,
      method: 'thread/resume',
      params: {
        threadId: 'thread-1',
        model: 'gpt-current',
        cwd: 'D:\\data',
        approvalPolicy: 'never',
        sandbox: 'read-only',
        excludeTurns: true,
      },
    });

    const reading = connection.readThread('thread-1');
    await vi.waitFor(() => {
      expect(requests.some((request) => request.method === 'thread/read')).toBe(true);
    });
    output.write(
      `${JSON.stringify({ id: 3, result: { thread: createThreadSessionResult().thread } })}\n`,
    );
    await expect(reading).resolves.toMatchObject({ id: 'thread-1', turns: [] });
    expect(requests).toContainEqual({
      id: 3,
      method: 'thread/read',
      params: { threadId: 'thread-1', includeTurns: true },
    });
    await connection.close();
  });

  it('should start read-only text turns with explicit runtime settings', async () => {
    const { connection, output, requests } = createHarness();
    const starting = connection.startTurn({
      threadId: 'thread-1',
      text: '{"schemaVersion":2}',
      cwd: 'D:\\data',
      model: 'gpt-current',
      effort: 'high',
      clientUserMessageId: 'delivery-1',
      outputSchema: { type: 'object' },
    });
    output.write(`${JSON.stringify({ id: 1, result: initializeResult })}\n`);
    await vi.waitFor(() => {
      expect(requests.some((request) => request.method === 'turn/start')).toBe(true);
    });
    output.write(
      `${JSON.stringify({
        id: 2,
        result: { turn: { id: 'turn-1', status: 'inProgress', error: null, items: [] } },
      })}\n`,
    );

    await expect(starting).resolves.toEqual({
      id: 'turn-1',
      status: 'inProgress',
      error: null,
      agentMessages: [],
    });
    expect(requests).toContainEqual({
      id: 2,
      method: 'turn/start',
      params: {
        threadId: 'thread-1',
        clientUserMessageId: 'delivery-1',
        input: [{ type: 'text', text: '{"schemaVersion":2}', text_elements: [] }],
        cwd: 'D:\\data',
        approvalPolicy: 'never',
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
        model: 'gpt-current',
        effort: 'high',
        outputSchema: { type: 'object' },
      },
    });
    await connection.close();
  });

  it('should wait for a completion that arrives before the start response', async () => {
    const { connection, output, requests } = createHarness();
    const running = connection.runTurn(
      {
        threadId: 'thread-1',
        text: 'hello',
        cwd: 'D:\\data',
        model: 'gpt-current',
        effort: 'high',
      },
      1000,
    );
    output.write(`${JSON.stringify({ id: 1, result: initializeResult })}\n`);
    await vi.waitFor(() => {
      expect(requests.some((request) => request.method === 'turn/start')).toBe(true);
    });
    output.write(
      `${JSON.stringify({
        method: 'turn/completed',
        params: {
          threadId: 'thread-1',
          turn: {
            id: 'turn-1',
            status: 'completed',
            error: null,
            items: [{ type: 'agentMessage', id: 'message-1', text: 'done', phase: 'final_answer' }],
          },
        },
      })}\n${JSON.stringify({
        id: 2,
        result: { turn: { id: 'turn-1', status: 'inProgress', error: null, items: [] } },
      })}\n`,
    );

    await expect(running).resolves.toMatchObject({
      id: 'turn-1',
      status: 'completed',
      agentMessages: [{ id: 'message-1', text: 'done', phase: 'final_answer' }],
    });
    await connection.close();
  });

  it('should decode subscribed session notifications and isolate decoder failures', () => {
    const { connection, output } = createHarness();
    const notifications = vi.fn();
    const errors = vi.fn();
    const unsubscribe = connection.subscribeSessionNotifications(notifications, errors);

    output.write(
      `${JSON.stringify({
        method: 'turn/started',
        params: {
          threadId: 'thread-1',
          turn: { id: 'turn-1', status: 'inProgress', error: null, items: [] },
        },
      })}\n`,
    );
    output.write('{"method":"turn/completed","params":{}}\n');

    expect(notifications).toHaveBeenCalledWith({
      kind: 'turnStarted',
      threadId: 'thread-1',
      turn: { id: 'turn-1', status: 'inProgress', error: null, agentMessages: [] },
    });
    expect(errors).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

function createThreadSessionResult() {
  return {
    thread: {
      id: 'thread-1',
      name: null,
      cwd: 'D:\\data',
      status: { type: 'idle' },
      turns: [],
    },
    model: 'gpt-current',
    cwd: 'D:\\data',
    instructionSources: [],
    reasoningEffort: 'low',
  };
}

function createModel(model: string) {
  return {
    id: model,
    model,
    displayName: model,
    description: '',
    hidden: false,
    isDefault: model === 'model-a',
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: [{ reasoningEffort: 'low', description: '' }],
  };
}
