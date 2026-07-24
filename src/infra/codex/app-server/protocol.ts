export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonRpcId = number | string;

export interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

export interface JsonRpcServerRequest extends JsonRpcNotification {
  id: JsonRpcId;
}

export interface JsonRpcSuccessResponse {
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JsonRpcClientRequest {
  id: number;
  method: string;
  params?: JsonValue;
}

export interface JsonRpcClientNotification {
  method: string;
  params?: JsonValue;
}

export interface JsonRpcClientErrorResponse {
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
  };
}

export type JsonRpcOutgoingMessage =
  | JsonRpcClientRequest
  | JsonRpcClientNotification
  | JsonRpcClientErrorResponse;

export type JsonRpcIncomingMessage =
  | JsonRpcNotification
  | JsonRpcServerRequest
  | JsonRpcSuccessResponse
  | JsonRpcErrorResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

function parseError(value: unknown): JsonRpcErrorResponse['error'] | null {
  if (!isRecord(value) || typeof value.code !== 'number' || typeof value.message !== 'string') {
    return null;
  }

  return {
    code: value.code,
    message: value.message,
    ...('data' in value ? { data: value.data } : {}),
  };
}

/**
 * Validates one decoded App Server JSONL message at the transport boundary.
 * @param value - JSON value parsed from one stdout line.
 * @returns A typed protocol message, or null for an invalid envelope.
 */
export function parseJsonRpcIncomingMessage(value: unknown): JsonRpcIncomingMessage | null {
  if (!isRecord(value)) return null;

  const id = value.id;
  const method = value.method;
  if (isJsonRpcId(id) && typeof method === 'string') {
    return {
      id,
      method,
      ...('params' in value ? { params: value.params } : {}),
    };
  }

  if (isJsonRpcId(id) && 'error' in value) {
    const error = parseError(value.error);
    return error ? { id, error } : null;
  }

  if (isJsonRpcId(id) && 'result' in value) {
    return { id, result: value.result };
  }

  if (typeof method === 'string') {
    return {
      method,
      ...('params' in value ? { params: value.params } : {}),
    };
  }

  return null;
}

export function isJsonRpcServerRequest(
  message: JsonRpcIncomingMessage,
): message is JsonRpcServerRequest {
  return 'id' in message && 'method' in message;
}

export function isJsonRpcNotification(
  message: JsonRpcIncomingMessage,
): message is JsonRpcNotification {
  return !('id' in message) && 'method' in message;
}

export function isJsonRpcErrorResponse(
  message: JsonRpcIncomingMessage,
): message is JsonRpcErrorResponse {
  return 'id' in message && 'error' in message;
}
