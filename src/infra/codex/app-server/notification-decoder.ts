import { CodexAppServerProtocolError } from './errors';
import type { CodexSessionNotification } from './notification-types';
import type { JsonRpcNotification } from './protocol';
import {
  decodeAgentMessageItem,
  decodeThreadStatus,
  decodeTurn,
  decodeTurnFailure,
} from './thread-value-decoder';
import { expectBoolean, expectRecord, expectString } from './value-decoder';

function decodeTurnLifecycle(
  notification: JsonRpcNotification,
  kind: 'turnStarted' | 'turnCompleted',
): CodexSessionNotification {
  const path = `${notification.method}.params`;
  const params = expectRecord(notification.params, path);
  return {
    kind,
    threadId: expectString(params.threadId, `${path}.threadId`, false),
    turn: decodeTurn(params.turn, `${path}.turn`),
  };
}

function decodeItemCompleted(notification: JsonRpcNotification): CodexSessionNotification {
  const path = 'item/completed.params';
  const params = expectRecord(notification.params, path);
  return {
    kind: 'itemCompleted',
    threadId: expectString(params.threadId, `${path}.threadId`, false),
    turnId: expectString(params.turnId, `${path}.turnId`, false),
    message: decodeAgentMessageItem(params.item, `${path}.item`),
  };
}

function decodeItemStarted(notification: JsonRpcNotification): CodexSessionNotification {
  const path = 'item/started.params';
  const params = expectRecord(notification.params, path);
  const item = expectRecord(params.item, `${path}.item`);
  return {
    kind: 'itemStarted',
    threadId: expectString(params.threadId, `${path}.threadId`, false),
    turnId: expectString(params.turnId, `${path}.turnId`, false),
    itemId: expectString(item.id, `${path}.item.id`, false),
    itemType: expectString(item.type, `${path}.item.type`, false),
  };
}

function decodeAgentMessageDelta(notification: JsonRpcNotification): CodexSessionNotification {
  const path = 'item/agentMessage/delta.params';
  const params = expectRecord(notification.params, path);
  return {
    kind: 'agentMessageDelta',
    threadId: expectString(params.threadId, `${path}.threadId`, false),
    turnId: expectString(params.turnId, `${path}.turnId`, false),
    itemId: expectString(params.itemId, `${path}.itemId`, false),
    delta: expectString(params.delta, `${path}.delta`),
  };
}

function decodeTurnError(notification: JsonRpcNotification): CodexSessionNotification {
  const path = 'error.params';
  const params = expectRecord(notification.params, path);
  const error = decodeTurnFailure(expectRecord(params.error, `${path}.error`), `${path}.error`);
  if (!error) {
    throw new CodexAppServerProtocolError(`Expected turn error at ${path}.error`);
  }

  return {
    kind: 'turnError',
    threadId: expectString(params.threadId, `${path}.threadId`, false),
    turnId: expectString(params.turnId, `${path}.turnId`, false),
    error,
    willRetry: expectBoolean(params.willRetry, `${path}.willRetry`),
  };
}

function decodeThreadStatusChanged(notification: JsonRpcNotification): CodexSessionNotification {
  const path = 'thread/status/changed.params';
  const params = expectRecord(notification.params, path);
  return {
    kind: 'threadStatusChanged',
    threadId: expectString(params.threadId, `${path}.threadId`, false),
    status: decodeThreadStatus(params.status, `${path}.status`),
  };
}

/** Decodes session-relevant App Server notifications and ignores unrelated methods. */
export function decodeSessionNotification(
  notification: JsonRpcNotification,
): CodexSessionNotification | null {
  switch (notification.method) {
    case 'turn/started':
      return decodeTurnLifecycle(notification, 'turnStarted');
    case 'turn/completed':
      return decodeTurnLifecycle(notification, 'turnCompleted');
    case 'item/started':
      return decodeItemStarted(notification);
    case 'item/completed':
      return decodeItemCompleted(notification);
    case 'item/agentMessage/delta':
      return decodeAgentMessageDelta(notification);
    case 'error':
      return decodeTurnError(notification);
    case 'thread/status/changed':
      return decodeThreadStatusChanged(notification);
    default:
      return null;
  }
}
