import { describe, expect, it } from 'vitest';
import {
  isJsonRpcErrorResponse,
  isJsonRpcNotification,
  isJsonRpcServerRequest,
  parseJsonRpcIncomingMessage,
} from '../protocol';

describe('parseJsonRpcIncomingMessage', () => {
  it('should parse success and error responses', () => {
    expect(parseJsonRpcIncomingMessage({ id: 1, result: { data: [] } })).toEqual({
      id: 1,
      result: { data: [] },
    });

    const error = parseJsonRpcIncomingMessage({
      id: 2,
      error: { code: -32602, message: 'invalid params', data: { field: 'model' } },
    });
    expect(error && isJsonRpcErrorResponse(error)).toBe(true);
  });

  it('should distinguish notifications from server requests', () => {
    const notification = parseJsonRpcIncomingMessage({
      method: 'turn/started',
      params: { threadId: 'thread-1' },
    });
    const request = parseJsonRpcIncomingMessage({
      id: 'approval-1',
      method: 'item/tool/requestUserInput',
      params: {},
    });

    expect(notification && isJsonRpcNotification(notification)).toBe(true);
    expect(request && isJsonRpcServerRequest(request)).toBe(true);
  });

  it('should reject malformed envelopes', () => {
    expect(parseJsonRpcIncomingMessage(null)).toBeNull();
    expect(parseJsonRpcIncomingMessage({ id: 1 })).toBeNull();
    expect(
      parseJsonRpcIncomingMessage({ id: 1, error: { code: 'bad', message: 'invalid' } }),
    ).toBeNull();
  });
});
