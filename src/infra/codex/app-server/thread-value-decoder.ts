import { CodexAppServerProtocolError } from './errors';
import type {
  CodexAgentMessage,
  CodexErrorInfo,
  CodexMessagePhase,
  CodexThreadActiveFlag,
  CodexThreadInfo,
  CodexThreadStatus,
  CodexTurnFailure,
  CodexTurnInfo,
  CodexTurnStatus,
} from './thread-types';
import { expectArray, expectNullableString, expectRecord, expectString } from './value-decoder';

function fail(path: string, expected: string): never {
  throw new CodexAppServerProtocolError(`Expected ${expected} at ${path}`);
}

function decodeThreadActiveFlag(value: unknown, path: string): CodexThreadActiveFlag {
  if (value === 'waitingOnApproval' || value === 'waitingOnUserInput') return value;
  return fail(path, 'thread active flag');
}

/** Decodes an App Server thread runtime status. */
export function decodeThreadStatus(value: unknown, path: string): CodexThreadStatus {
  const record = expectRecord(value, path);
  const type = expectString(record.type, `${path}.type`, false);
  if (type === 'notLoaded' || type === 'idle' || type === 'systemError') return { type };
  if (type !== 'active') return fail(`${path}.type`, 'thread status');

  return {
    type,
    activeFlags: expectArray(record.activeFlags, `${path}.activeFlags`).map((flag, index) =>
      decodeThreadActiveFlag(flag, `${path}.activeFlags[${index}]`),
    ),
  };
}

function decodeTurnStatus(value: unknown, path: string): CodexTurnStatus {
  if (
    value === 'completed' ||
    value === 'interrupted' ||
    value === 'failed' ||
    value === 'inProgress'
  ) {
    return value;
  }
  return fail(path, 'turn status');
}

function decodeMessagePhase(value: unknown, path: string): CodexMessagePhase | null {
  if (value === null || value === 'commentary' || value === 'final_answer') return value;
  return fail(path, 'message phase or null');
}

/** Decodes an agent message item and ignores other thread item variants. */
export function decodeAgentMessageItem(value: unknown, path: string): CodexAgentMessage | null {
  const record = expectRecord(value, path);
  const type = expectString(record.type, `${path}.type`, false);
  if (type !== 'agentMessage') return null;

  return {
    id: expectString(record.id, `${path}.id`, false),
    text: expectString(record.text, `${path}.text`),
    phase: decodeMessagePhase(record.phase, `${path}.phase`),
  };
}

function decodeAgentMessages(value: unknown, path: string): CodexAgentMessage[] {
  const messages: CodexAgentMessage[] = [];
  for (const [index, item] of expectArray(value, path).entries()) {
    const message = decodeAgentMessageItem(item, `${path}[${index}]`);
    if (message) messages.push(message);
  }
  return messages;
}

const SIMPLE_CODEX_ERROR_INFO = new Set<string>([
  'contextWindowExceeded',
  'usageLimitExceeded',
  'serverOverloaded',
  'cyberPolicy',
  'internalServerError',
  'unauthorized',
  'badRequest',
  'threadRollbackFailed',
  'sandboxError',
  'other',
]);

function decodeHttpFailure(value: unknown, path: string): { httpStatusCode: number | null } {
  const record = expectRecord(value, path);
  const status = record.httpStatusCode;
  if (
    status !== null &&
    (typeof status !== 'number' || !Number.isSafeInteger(status) || status < 100 || status > 599)
  ) {
    return fail(`${path}.httpStatusCode`, 'HTTP status code or null');
  }
  return { httpStatusCode: status };
}

function decodeCodexErrorInfo(value: unknown, path: string): CodexErrorInfo | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (SIMPLE_CODEX_ERROR_INFO.has(value)) return value as CodexErrorInfo;
    return fail(path, 'Codex error info');
  }
  const record = expectRecord(value, path);
  const keys = Object.keys(record);
  if (keys.length !== 1) return fail(path, 'Codex error info');
  const kind = keys[0];
  if (
    kind === 'httpConnectionFailed' ||
    kind === 'responseStreamConnectionFailed' ||
    kind === 'responseStreamDisconnected' ||
    kind === 'responseTooManyFailedAttempts'
  ) {
    return { [kind]: decodeHttpFailure(record[kind], `${path}.${kind}`) } as CodexErrorInfo;
  }
  if (kind === 'activeTurnNotSteerable') {
    const details = expectRecord(record[kind], `${path}.${kind}`);
    if (details.turnKind !== 'review' && details.turnKind !== 'compact') {
      return fail(`${path}.${kind}.turnKind`, 'non-steerable turn kind');
    }
    return { activeTurnNotSteerable: { turnKind: details.turnKind } };
  }
  return fail(path, 'Codex error info');
}

/** Decodes failure details retained by the provider. */
export function decodeTurnFailure(value: unknown, path: string): CodexTurnFailure | null {
  if (value === null) return null;
  const record = expectRecord(value, path);
  return {
    message: expectString(record.message, `${path}.message`),
    codexErrorInfo: decodeCodexErrorInfo(record.codexErrorInfo, `${path}.codexErrorInfo`),
    additionalDetails: expectNullableString(record.additionalDetails, `${path}.additionalDetails`),
  };
}

/** Decodes a turn and its ordered agent messages. */
export function decodeTurn(value: unknown, path: string): CodexTurnInfo {
  const record = expectRecord(value, path);
  return {
    id: expectString(record.id, `${path}.id`, false),
    status: decodeTurnStatus(record.status, `${path}.status`),
    error: decodeTurnFailure(record.error, `${path}.error`),
    agentMessages: decodeAgentMessages(record.items, `${path}.items`),
  };
}

/** Decodes thread identity, runtime state, and loaded turns. */
export function decodeThread(value: unknown, path: string): CodexThreadInfo {
  const record = expectRecord(value, path);
  return {
    id: expectString(record.id, `${path}.id`, false),
    name: expectNullableString(record.name, `${path}.name`),
    cwd: expectString(record.cwd, `${path}.cwd`, false),
    status: decodeThreadStatus(record.status, `${path}.status`),
    turns: expectArray(record.turns, `${path}.turns`).map((turn, index) =>
      decodeTurn(turn, `${path}.turns[${index}]`),
    ),
  };
}
