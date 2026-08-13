import { hashCanonicalJson } from '@/core/provenance';
import {
  isResultVersionIndex,
  isStoredResultVersion,
  type ResultVersionIndex,
  type ResultVersionMetadata,
  type StoredResultVersion,
} from '@/core/result-version';
import { readJsonFileSnapshot, type JsonFileSnapshot } from './read-state';
import { listStoredResultVersionIds } from './result-version-files';
import { readResultVersionLock, type ResultVersionLockState } from './result-version-lock';
import { getResultVersionFilePath, getResultVersionIndexPath } from './result-version-paths';

export type ResultCandidateIdsSnapshot = JsonFileSnapshot<string[]>;
export type ResultLockSnapshotState =
  | ResultVersionLockState
  | { status: 'unreadable'; error: unknown };

export interface ResultLockSnapshot {
  state: ResultLockSnapshotState;
  identity: string;
}

export type StableSnapshotResult<T> = { status: 'stable'; snapshot: T } | { status: 'busy' };

/**
 * Reads one result index with explicit file and contract states.
 * @param username - User that owns the result archive.
 * @returns Index snapshot and content identity.
 */
export function readResultVersionIndexSnapshot(
  username: string,
): JsonFileSnapshot<ResultVersionIndex> {
  return readJsonFileSnapshot(getResultVersionIndexPath(username), (value) =>
    isResultVersionIndex(value) ? value : undefined,
  );
}

/**
 * Reads one immutable envelope and verifies its path-bound identity.
 * @param username - User that owns the result archive.
 * @param versionId - Canonical version ID used to resolve the file.
 * @returns Envelope snapshot and content identity.
 */
export function readStoredResultVersionSnapshot(
  username: string,
  versionId: string,
): JsonFileSnapshot<StoredResultVersion> {
  return readJsonFileSnapshot(getResultVersionFilePath(username, versionId), (value) => {
    if (!isStoredResultVersion(value) || value.metadata.versionId !== versionId) return undefined;
    if (value.inputSummary !== null && value.inputSummary.username !== username) return undefined;
    return value;
  });
}

/**
 * Lists canonical version candidates for consistency checks.
 * @param username - User that owns the result archive.
 * @returns Candidate IDs or an unreadable directory state.
 */
export function readResultCandidateIdsSnapshot(username: string): ResultCandidateIdsSnapshot {
  try {
    const value = listStoredResultVersionIds(username);
    return {
      state: { status: 'valid', value },
      identity: hashCanonicalJson(value),
    };
  } catch (error) {
    return {
      state: { status: 'unreadable', error },
      identity: `unreadable:${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Reads the writer lock without acquiring or recovering it.
 * @param username - User that owns the result archive.
 * @returns Lock state and owner-token identity when available.
 */
export function readResultLockSnapshot(username: string): ResultLockSnapshot {
  try {
    const state = readResultVersionLock(username);
    return {
      state,
      identity: state.status === 'locked' ? hashCanonicalJson(state.owner) : state.status,
    };
  } catch (error) {
    return {
      state: { status: 'unreadable', error },
      identity: `unreadable:${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Checks that the index owns every canonical envelope candidate and no others.
 * @param candidateIds - Canonical IDs found on disk.
 * @param index - Validated result version index.
 * @returns Whether both ordered ID sets match.
 */
export function resultCandidateIdsMatchIndex(
  candidateIds: readonly string[],
  index: ResultVersionIndex,
): boolean {
  const indexedIds = index.versions.map(({ versionId }) => versionId);
  return (
    candidateIds.length === indexedIds.length &&
    candidateIds.every((versionId, position) => versionId === indexedIds[position])
  );
}

/**
 * Compares validated envelope metadata with its index entry.
 * @param envelope - Validated immutable result envelope.
 * @param metadata - Validated index metadata for the same ID.
 * @returns Whether both metadata values are canonically identical.
 */
export function resultVersionMetadataMatches(
  envelope: StoredResultVersion,
  metadata: ResultVersionMetadata,
): boolean {
  return hashCanonicalJson(envelope.metadata) === hashCanonicalJson(metadata);
}

/**
 * Reports whether a lock file exists, including invalid or unreadable locks.
 * @param lock - Result writer lock snapshot.
 * @returns Whether a writer lock file may still own the archive.
 */
export function hasResultWriteLock(lock: ResultLockSnapshot): boolean {
  return lock.state.status !== 'missing';
}

/**
 * Repeats a read-only query once when its complete snapshot identity changes.
 *
 * @param readSnapshot - Complete mode-specific result snapshot reader.
 * @returns A stable snapshot or busy when the retry also changes.
 */
export function readStableResultSnapshot<T extends { identity: string }>(
  readSnapshot: () => T,
): StableSnapshotResult<T> {
  const first = readSnapshot();
  const second = readSnapshot();
  if (first.identity === second.identity) return { status: 'stable', snapshot: second };

  const retry = readSnapshot();
  return second.identity === retry.identity
    ? { status: 'stable', snapshot: retry }
    : { status: 'busy' };
}
