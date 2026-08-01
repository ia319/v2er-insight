import fs from 'fs';
import {
  isResultVersionId,
  isResultVersionIndexV1,
  isStoredResultVersionV1,
  parseResultVersionId,
  type ResultVersionIndexV1,
  type StoredResultVersionV1,
} from '@/core/result-version';
import { readJsonFileResult } from './reader';
import {
  getResultVersionFilePath,
  getResultVersionFilesDir,
  getResultVersionIndexPath,
} from './result-version-paths';
import { writeJsonFileAtomically, writeJsonFileExclusively } from './writer';

export type ResultVersionIndexReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; index: ResultVersionIndexV1 };

export type StoredResultVersionReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; version: StoredResultVersionV1 };

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

/**
 * Reads and validates one user's complete result version index.
 *
 * @param username - V2EX username that owns the saved results.
 * @returns Missing, invalid, or validated index state.
 */
export function readResultVersionIndex(username: string): ResultVersionIndexReadResult {
  const result = readJsonFileResult(getResultVersionIndexPath(username));
  if (result.status !== 'success') return result;
  return isResultVersionIndexV1(result.data)
    ? { status: 'valid', index: result.data }
    : { status: 'invalid' };
}

/**
 * Reads and validates one immutable result version.
 *
 * @param username - V2EX username that owns the saved results.
 * @param versionId - Canonical result version ID.
 * @returns Missing, invalid, or validated version state.
 */
export function readStoredResultVersion(
  username: string,
  versionId: string,
): StoredResultVersionReadResult {
  const result = readJsonFileResult(getResultVersionFilePath(username, versionId));
  if (result.status !== 'success') return result;
  return isStoredResultVersionV1(result.data) && result.data.metadata.versionId === versionId
    ? { status: 'valid', version: result.data }
    : { status: 'invalid' };
}

/**
 * Lists canonical immutable result IDs without trusting arbitrary directory entries.
 *
 * @param username - V2EX username that owns the saved results.
 * @returns Canonical IDs ordered by increasing sequence.
 * @throws A filesystem error other than a missing versions directory.
 */
export function listStoredResultVersionIds(username: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(getResultVersionFilesDir(username), { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -'.json'.length))
    .filter(isResultVersionId)
    .sort((left, right) => {
      const leftSequence = parseResultVersionId(left);
      const rightSequence = parseResultVersionId(right);
      return (leftSequence ?? 0) - (rightSequence ?? 0);
    });
}

/**
 * Atomically replaces the validated result version index.
 *
 * @param username - V2EX username that owns the saved results.
 * @param index - Complete validated index.
 * @throws {TypeError} When the index violates its runtime contract.
 * @throws A filesystem or serialization error.
 */
export function writeResultVersionIndex(username: string, index: ResultVersionIndexV1): void {
  if (!isResultVersionIndexV1(index)) {
    throw new TypeError('Result version index is invalid');
  }
  writeJsonFileAtomically(getResultVersionIndexPath(username), index);
}

/**
 * Publishes one validated result version without replacing an existing file.
 *
 * @param username - V2EX username that owns the saved results.
 * @param version - Complete validated result envelope.
 * @throws {TypeError} When the envelope violates its runtime contract.
 * @throws A filesystem or serialization error, including an existing target.
 */
export function writeStoredResultVersion(username: string, version: StoredResultVersionV1): void {
  if (!isStoredResultVersionV1(version)) {
    throw new TypeError('Stored result version is invalid');
  }
  writeJsonFileExclusively(getResultVersionFilePath(username, version.metadata.versionId), version);
}
