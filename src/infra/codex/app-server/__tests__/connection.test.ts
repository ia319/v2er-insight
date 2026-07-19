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
});

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
