import { randomUUID } from 'node:crypto';

const RESULT_VERSION_ID_PATTERN = /^v([0-9]{6,})$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Formats one positive sequence as its stable result version ID.
 *
 * @param sequence - Positive safe integer allocated under the result lock.
 * @returns A zero-padded version ID such as v000001.
 * @throws {RangeError} When the sequence is not a positive safe integer.
 */
export function formatResultVersionId(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError('Result version sequence must be a positive safe integer');
  }

  return `v${String(sequence).padStart(6, '0')}`;
}

/**
 * Parses a canonical result version ID.
 *
 * @param value - Untrusted version ID.
 * @returns The positive sequence, or null when the ID is not canonical.
 */
export function parseResultVersionId(value: string): number | null {
  const match = RESULT_VERSION_ID_PATTERN.exec(value);
  const digits = match?.[1];
  if (!digits) return null;

  const sequence = Number(digits);
  return Number.isSafeInteger(sequence) && sequence > 0 && formatResultVersionId(sequence) === value
    ? sequence
    : null;
}

/** Returns whether a value is a canonical result version ID. */
export function isResultVersionId(value: unknown): value is string {
  return typeof value === 'string' && parseResultVersionId(value) !== null;
}

/** Creates the stable identity shared by one provider delivery and its saved result. */
export function createResultDeliveryId(): string {
  return randomUUID();
}

/** Returns whether a value is a lowercase UUID generated for one result delivery. */
export function isResultDeliveryId(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}
