import { createHash } from 'node:crypto';
import fs from 'fs';

export type ReadState<T> =
  | { status: 'missing' }
  | { status: 'invalid'; reason: 'json' | 'contract' }
  | { status: 'unreadable'; error: unknown }
  | { status: 'valid'; value: T };

export interface JsonFileSnapshot<T> {
  state: ReadState<T>;
  identity: string;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function describeUnreadableError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = 'code' in error ? String(error.code) : '';
  return `${error.name}:${code}:${error.message}`;
}

/**
 * Reads one JSON file while preserving its filesystem and contract state.
 *
 * @param filePath - Validated application-owned file path.
 * @param parse - Contract parser that returns undefined for unsupported values.
 * @returns Parsed state plus a content identity for bounded consistency checks.
 */
export function readJsonFileSnapshot<T>(
  filePath: string,
  parse: (value: unknown) => T | undefined,
): JsonFileSnapshot<T> {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return { state: { status: 'missing' }, identity: 'missing' };
    }
    return {
      state: { status: 'unreadable', error },
      identity: `unreadable:${describeUnreadableError(error)}`,
    };
  }

  const identity = createHash('sha256').update(content, 'utf8').digest('hex');
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return { state: { status: 'invalid', reason: 'json' }, identity };
  }

  const parsed = parse(value);
  return parsed === undefined
    ? { state: { status: 'invalid', reason: 'contract' }, identity }
    : { state: { status: 'valid', value: parsed }, identity };
}
