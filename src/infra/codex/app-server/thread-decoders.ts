import type { CodexThreadInfo, CodexThreadSessionInfo, CodexTurnInfo } from './thread-types';
import { decodeThread, decodeTurn } from './thread-value-decoder';
import { expectArray, expectNullableString, expectRecord, expectString } from './value-decoder';

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
