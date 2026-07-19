import { PassThrough } from 'stream';
import { describe, expect, it, vi } from 'vitest';
import { CodexAppServerProtocolError, CodexAppServerRequestTimeoutError } from '../errors';
import { JsonlRpcClient } from '../jsonl-client';

function decodeString(value: unknown): string {
  if (typeof value !== 'string') throw new CodexAppServerProtocolError('Expected string result');
  return value;
}

function createHarness() {
  const input = new PassThrough();
  const output = new PassThrough();
  const writes: string[] = [];
  input.setEncoding('utf8');
  input.on('data', (chunk: string) => writes.push(chunk));

  return { input, output, writes };
}

describe('JsonlRpcClient', () => {
  it('should correlate chunked responses and interleaved notifications', async () => {
    const { input, output, writes } = createHarness();
    const notifications: string[] = [];
    const client = new JsonlRpcClient(input, output, {
      defaultTimeoutMs: 1000,
      onNotification: (notification) => notifications.push(notification.method),
    });

    const first = client.request('first', {}, decodeString);
    const second = client.request('second', {}, decodeString);
    output.write('{"method":"turn/started","params":{"text":"你');
    output.write('好"}}\n{"id":2,"result":"two"}\n{"id":1,"result":"one"}\n');

    await expect(Promise.all([first, second])).resolves.toEqual(['one', 'two']);
    expect(notifications).toEqual(['turn/started']);
    expect(writes.join('')).toContain('{"id":1,"method":"first","params":{}}\n');
    client.dispose();
  });

  it('should reject server requests with a method-not-found response', () => {
    const { input, output, writes } = createHarness();
    const warnings: string[] = [];
    const client = new JsonlRpcClient(input, output, {
      defaultTimeoutMs: 1000,
      onProtocolWarning: (warning) => warnings.push(warning),
    });

    output.write('{"id":"approval-1","method":"item/tool/requestUserInput","params":{}}\n');

    expect(writes.join('')).toContain(
      '{"id":"approval-1","error":{"code":-32601,"message":"Client does not support server requests"}}\n',
    );
    expect(warnings).toEqual(['Rejected App Server request: item/tool/requestUserInput']);
    client.dispose();
  });

  it('should apply request deadlines independently', async () => {
    vi.useFakeTimers();
    try {
      const { input, output } = createHarness();
      const client = new JsonlRpcClient(input, output, { defaultTimeoutMs: 25 });

      const request = client.request('model/list', {}, decodeString);
      const rejection = expect(request).rejects.toBeInstanceOf(CodexAppServerRequestTimeoutError);
      await vi.advanceTimersByTimeAsync(25);

      await rejection;
      client.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should reject invalid result shapes through the method decoder', async () => {
    const { input, output } = createHarness();
    const client = new JsonlRpcClient(input, output, { defaultTimeoutMs: 1000 });

    const request = client.request('model/list', {}, decodeString);
    output.write('{"id":1,"result":{"data":[]}}\n');

    await expect(request).rejects.toThrow('Expected string result');
    client.dispose();
  });

  it('should fail pending requests on invalid JSONL', async () => {
    const { input, output } = createHarness();
    const client = new JsonlRpcClient(input, output, { defaultTimeoutMs: 1000 });

    const request = client.request('initialize', {}, decodeString);
    output.write('not-json\n');

    await expect(request).rejects.toBeInstanceOf(CodexAppServerProtocolError);
  });
});
