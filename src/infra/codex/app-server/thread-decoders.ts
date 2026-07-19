import type {
  CodexAgentMessage,
  CodexMessagePhase,
  CodexThreadActiveFlag,
  CodexThreadInfo,
  CodexThreadSessionInfo,
  CodexThreadStatus,
  CodexTurnFailure,
  CodexTurnInfo,
  CodexTurnStatus,
} from './thread-types';
import { expectArray, expectNullableString, expectRecord, expectString } from './value-decoder';
import { CodexAppServerProtocolError } from './errors';

function fail(path: string, expected: string): never {
  throw new CodexAppServerProtocolError(`Expected ${expected} at ${path}`);
}

function decodeThreadActiveFlag(value: unknown, path: string): CodexThreadActiveFlag {
  if (value === 'waitingOnApproval' || value === 'waitingOnUserInput') return value;
  return fail(path, 'thread active flag');
}

function decodeThreadStatus(value: unknown, path: string): CodexThreadStatus {
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

function decodeAgentMessage(value: Record<string, unknown>, path: string): CodexAgentMessage {
  return {
    id: expectString(value.id, `${path}.id`, false),
    text: expectString(value.text, `${path}.text`),
    phase: decodeMessagePhase(value.phase, `${path}.phase`),
  };
}

function decodeAgentMessages(value: unknown, path: string): CodexAgentMessage[] {
  const messages: CodexAgentMessage[] = [];
  for (const [index, item] of expectArray(value, path).entries()) {
    const itemPath = `${path}[${index}]`;
    const record = expectRecord(item, itemPath);
    const type = expectString(record.type, `${itemPath}.type`, false);
    if (type === 'agentMessage') messages.push(decodeAgentMessage(record, itemPath));
  }
  return messages;
}

function decodeTurnFailure(value: unknown, path: string): CodexTurnFailure | null {
  if (value === null) return null;
  const record = expectRecord(value, path);
  return {
    message: expectString(record.message, `${path}.message`),
    additionalDetails: expectNullableString(record.additionalDetails, `${path}.additionalDetails`),
  };
}

function decodeTurn(value: unknown, path: string): CodexTurnInfo {
  const record = expectRecord(value, path);
  return {
    id: expectString(record.id, `${path}.id`, false),
    status: decodeTurnStatus(record.status, `${path}.status`),
    error: decodeTurnFailure(record.error, `${path}.error`),
    agentMessages: decodeAgentMessages(record.items, `${path}.items`),
  };
}

function decodeThread(value: unknown, path: string): CodexThreadInfo {
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

function decodeThreadSessionResponse(value: unknown, path: string): CodexThreadSessionInfo {
  const record = expectRecord(value, path);
  return {
    thread: decodeThread(record.thread, `${path}.thread`),
    model: expectString(record.model, `${path}.model`, false),
    cwd: expectString(record.cwd, `${path}.cwd`, false),
    instructionSources: expectArray(record.instructionSources, `${path}.instructionSources`).map(
      (source, index) => expectString(source, `${path}.instructionSources[${index}]`, false),
    ),
    reasoningEffort: expectNullableString(record.reasoningEffort, `${path}.reasoningEffort`),
  };
}

/** Decodes the result of `thread/start`. */
export function decodeThreadStartResponse(value: unknown): CodexThreadSessionInfo {
  return decodeThreadSessionResponse(value, 'thread/start.result');
}

/** Decodes the result of `thread/resume`. */
export function decodeThreadResumeResponse(value: unknown): CodexThreadSessionInfo {
  return decodeThreadSessionResponse(value, 'thread/resume.result');
}

/** Decodes the result of `thread/read`. */
export function decodeThreadReadResponse(value: unknown): CodexThreadInfo {
  const record = expectRecord(value, 'thread/read.result');
  return decodeThread(record.thread, 'thread/read.result.thread');
}

/** Validates the empty result of `thread/name/set`. */
export function decodeThreadSetNameResponse(value: unknown): void {
  expectRecord(value, 'thread/name/set.result');
}

/** Decodes the result of `turn/start`. */
export function decodeTurnStartResponse(value: unknown): CodexTurnInfo {
  const record = expectRecord(value, 'turn/start.result');
  return decodeTurn(record.turn, 'turn/start.result.turn');
}
