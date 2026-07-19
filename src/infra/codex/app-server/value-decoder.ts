import { CodexAppServerProtocolError } from './errors';

function fail(path: string, expected: string): never {
  throw new CodexAppServerProtocolError(`Expected ${expected} at ${path}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Decodes a JSON object at the given protocol path. */
export function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) return fail(path, 'object');
  return value;
}

/** Decodes a string and optionally rejects blank values. */
export function expectString(value: unknown, path: string, allowEmpty = true): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    return fail(path, allowEmpty ? 'string' : 'non-empty string');
  }
  return value;
}

/** Decodes a boolean at the given protocol path. */
export function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return fail(path, 'boolean');
  return value;
}

/** Decodes an array at the given protocol path. */
export function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, 'array');
  return value;
}

/** Decodes a nullable string at the given protocol path. */
export function expectNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return expectString(value, path);
}
