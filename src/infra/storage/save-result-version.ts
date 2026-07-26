import fs from 'fs';
import { isDeepStrictEqual } from 'node:util';
import { isAIAnalysisResult, type AIAnalysisResult } from '@/core/ai';
import { hashCanonicalJson } from '@/core/provenance/canonical-json';
import {
  formatResultVersionId,
  isResultVersionMetadata,
  RESULT_VERSION_INDEX_SCHEMA_VERSION,
  STORED_RESULT_VERSION_SCHEMA_VERSION,
  type ResultVersionIndexV1,
  type ResultVersionMetadata,
  type ResultVersionSource,
  type StoredResultVersionV1,
} from '@/core/result-version';
import { getDataFilePath } from './paths';
import { readDataFileResult } from './reader';
import {
  listStoredResultVersionIds,
  readResultVersionIndex,
  readStoredResultVersion,
  writeResultVersionIndex,
  writeStoredResultVersion,
} from './result-version-files';
import { withResultVersionLock } from './result-version-lock';
import { writeDataFile } from './writer';

export type ResultVersionSaveErrorCode =
  | 'RESULT_VERSION_CORRUPT'
  | 'RESULT_DELIVERY_CONFLICT'
  | 'RESULT_CURRENT_DIVERGED'
  | 'RESULT_CURRENT_INVALID';

/** Error raised when saved result state cannot be advanced without data loss. */
export class ResultVersionSaveError extends Error {
  readonly code: ResultVersionSaveErrorCode;

  constructor(code: ResultVersionSaveErrorCode, message: string) {
    super(message);
    this.name = 'ResultVersionSaveError';
    this.code = code;
  }
}

type CurrentResultState =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; result: AIAnalysisResult; hash: string };

interface LoadedResultVersions {
  index: ResultVersionIndexV1;
  indexWasMissing: boolean;
  versions: Map<string, StoredResultVersionV1>;
}

function fail(code: ResultVersionSaveErrorCode, message: string): never {
  throw new ResultVersionSaveError(code, message);
}

function createEmptyIndex(updatedAt: string): ResultVersionIndexV1 {
  return {
    schemaVersion: RESULT_VERSION_INDEX_SCHEMA_VERSION,
    nextSequence: 1,
    latestVersionId: null,
    versions: [],
    updatedAt,
  };
}

function readCurrentResult(username: string): CurrentResultState {
  const current = readDataFileResult(username, 'result');
  if (current.status !== 'success') return current;
  if (!isAIAnalysisResult(current.data)) return { status: 'invalid' };
  return {
    status: 'valid',
    result: current.data,
    hash: hashCanonicalJson(current.data),
  };
}

function getCurrentResultModifiedAt(username: string): string | null {
  try {
    const modifiedAt = fs.statSync(getDataFilePath(username, 'result')).mtimeMs;
    return Number.isFinite(modifiedAt) ? new Date(modifiedAt).toISOString() : null;
  } catch {
    return null;
  }
}

function loadResultVersions(username: string, now: string): LoadedResultVersions {
  const indexState = readResultVersionIndex(username);
  if (indexState.status === 'invalid') {
    return fail('RESULT_VERSION_CORRUPT', 'Result version index is invalid or unreadable');
  }

  const index = indexState.status === 'valid' ? indexState.index : createEmptyIndex(now);
  const versions = new Map<string, StoredResultVersionV1>();
  for (const metadata of index.versions) {
    const stored = readStoredResultVersion(username, metadata.versionId);
    if (stored.status !== 'valid' || !isDeepStrictEqual(stored.version.metadata, metadata)) {
      return fail(
        'RESULT_VERSION_CORRUPT',
        `Indexed result version "${metadata.versionId}" is missing, invalid, or inconsistent`,
      );
    }
    versions.set(metadata.versionId, stored.version);
  }

  return {
    index,
    indexWasMissing: indexState.status === 'missing',
    versions,
  };
}

function appendVersion(
  username: string,
  loaded: LoadedResultVersions,
  version: StoredResultVersionV1,
  updatedAt: string,
): void {
  const metadata = version.metadata;
  if (
    metadata.sequence !== loaded.index.nextSequence ||
    metadata.versionId !== formatResultVersionId(loaded.index.nextSequence) ||
    metadata.previousLatestVersionId !== loaded.index.latestVersionId
  ) {
    return fail(
      'RESULT_VERSION_CORRUPT',
      `Result version "${metadata.versionId}" does not extend the current index`,
    );
  }

  const nextSequence = loaded.index.nextSequence + 1;
  if (!Number.isSafeInteger(nextSequence)) {
    return fail('RESULT_VERSION_CORRUPT', 'Result version sequence is exhausted');
  }

  const index: ResultVersionIndexV1 = {
    ...loaded.index,
    nextSequence,
    latestVersionId: metadata.versionId,
    versions: [...loaded.index.versions, metadata],
    updatedAt,
  };
  writeResultVersionIndex(username, index);
  loaded.index = index;
  loaded.versions.set(metadata.versionId, version);
}

function sourceMatchesMetadata(
  source: ResultVersionSource,
  metadata: ResultVersionMetadata,
  resultHash: string,
): boolean {
  return (
    metadata.deliveryId === source.deliveryId &&
    metadata.origin === source.origin &&
    metadata.createdAt === source.createdAt &&
    metadata.provider === source.provider &&
    metadata.model === source.model &&
    metadata.reasoningLevel === source.reasoningLevel &&
    metadata.localSessionId === source.localSessionId &&
    metadata.externalThreadId === source.externalThreadId &&
    metadata.threadName === source.threadName &&
    metadata.promptHash === source.promptHash &&
    metadata.analysisFingerprint === source.analysisFingerprint &&
    metadata.payloadHash === source.payloadHash &&
    metadata.dataQuality === source.dataQuality &&
    metadata.warningCount === source.warningCount &&
    metadata.appVersion === source.appVersion &&
    metadata.resultHash === resultHash
  );
}

function buildGeneratedVersion(
  loaded: LoadedResultVersions,
  current: Extract<CurrentResultState, { status: 'valid' }> | { status: 'missing' },
  result: AIAnalysisResult,
  resultHash: string,
  source: ResultVersionSource,
  savedAt: string,
): StoredResultVersionV1 {
  const sequence = loaded.index.nextSequence;
  const metadata: ResultVersionMetadata = {
    versionId: formatResultVersionId(sequence),
    sequence,
    origin: source.origin,
    deliveryId: source.deliveryId,
    previousLatestVersionId: loaded.index.latestVersionId,
    previousCurrentHash: current.status === 'valid' ? current.hash : null,
    createdAt: source.createdAt,
    savedAt,
    provider: source.provider,
    model: source.model,
    reasoningLevel: source.reasoningLevel,
    localSessionId: source.localSessionId,
    externalThreadId: source.externalThreadId,
    threadName: source.threadName,
    promptHash: source.promptHash,
    analysisFingerprint: source.analysisFingerprint,
    payloadHash: source.payloadHash,
    resultHash,
    dataQuality: source.dataQuality,
    warningCount: source.warningCount,
    appVersion: source.appVersion,
  };
  if (!isResultVersionMetadata(metadata)) {
    throw new TypeError('Result version source is invalid');
  }
  return {
    schemaVersion: STORED_RESULT_VERSION_SCHEMA_VERSION,
    metadata,
    result,
  };
}

function buildProtectedVersion(
  username: string,
  loaded: LoadedResultVersions,
  current: Extract<CurrentResultState, { status: 'valid' }>,
  origin: Extract<ResultVersionMetadata['origin'], 'legacy' | 'untracked-current'>,
  savedAt: string,
): StoredResultVersionV1 {
  const sequence = loaded.index.nextSequence;
  const metadata: ResultVersionMetadata = {
    versionId: formatResultVersionId(sequence),
    sequence,
    origin,
    deliveryId: null,
    previousLatestVersionId: loaded.index.latestVersionId,
    previousCurrentHash: current.hash,
    createdAt: getCurrentResultModifiedAt(username),
    savedAt,
    provider: 'unknown',
    model: null,
    reasoningLevel: null,
    localSessionId: null,
    externalThreadId: null,
    threadName: null,
    promptHash: null,
    analysisFingerprint: null,
    payloadHash: null,
    resultHash: current.hash,
    dataQuality: 'unknown',
    warningCount: null,
    appVersion: null,
  };
  return {
    schemaVersion: STORED_RESULT_VERSION_SCHEMA_VERSION,
    metadata,
    result: current.result,
  };
}

function recoverProtectedCandidate(
  username: string,
  loaded: LoadedResultVersions,
  candidate: StoredResultVersionV1,
  current: CurrentResultState,
  now: string,
): void {
  const metadata = candidate.metadata;
  if (
    (metadata.origin !== 'legacy' && metadata.origin !== 'untracked-current') ||
    metadata.deliveryId !== null ||
    metadata.previousCurrentHash !== metadata.resultHash
  ) {
    return fail(
      'RESULT_VERSION_CORRUPT',
      `Result version "${metadata.versionId}" is not a recoverable protected result`,
    );
  }
  if (current.status === 'invalid') {
    return fail('RESULT_CURRENT_INVALID', 'Current result is invalid or unreadable');
  }
  if (current.status !== 'valid' || current.hash !== metadata.resultHash) {
    return fail(
      'RESULT_CURRENT_DIVERGED',
      `Current result does not match protected version "${metadata.versionId}"`,
    );
  }
  appendVersion(username, loaded, candidate, now);
}

function recoverGeneratedCandidate(
  username: string,
  loaded: LoadedResultVersions,
  candidate: StoredResultVersionV1,
  current: CurrentResultState,
  result: AIAnalysisResult,
  resultHash: string,
  source: ResultVersionSource,
  now: string,
): ResultVersionMetadata {
  const metadata = candidate.metadata;
  if (!sourceMatchesMetadata(source, metadata, resultHash)) {
    return fail(
      'RESULT_DELIVERY_CONFLICT',
      `Delivery "${source.deliveryId}" conflicts with candidate result version "${metadata.versionId}"`,
    );
  }
  if (current.status === 'invalid') {
    return fail('RESULT_CURRENT_INVALID', 'Current result is invalid or unreadable');
  }

  const currentMatchesPrevious =
    current.status === 'missing'
      ? metadata.previousCurrentHash === null
      : current.hash === metadata.previousCurrentHash;
  const currentMatchesCandidate =
    current.status === 'valid' && current.hash === metadata.resultHash;
  if (!currentMatchesPrevious && !currentMatchesCandidate) {
    return fail(
      'RESULT_CURRENT_DIVERGED',
      `Current result does not match candidate result version "${metadata.versionId}"`,
    );
  }
  if (currentMatchesPrevious) {
    writeDataFile(username, 'result', result);
  }
  appendVersion(username, loaded, candidate, now);
  return metadata;
}

function recoverCandidate(
  username: string,
  loaded: LoadedResultVersions,
  current: CurrentResultState,
  result: AIAnalysisResult,
  resultHash: string,
  source: ResultVersionSource,
  now: string,
): ResultVersionMetadata | null {
  const indexedIds = new Set(loaded.index.versions.map((metadata) => metadata.versionId));
  const candidateIds = listStoredResultVersionIds(username).filter(
    (versionId) => !indexedIds.has(versionId),
  );
  if (candidateIds.length === 0) return null;
  if (candidateIds.length !== 1) {
    return fail('RESULT_VERSION_CORRUPT', 'Multiple unindexed result versions require review');
  }

  const candidateId = candidateIds[0] as string;
  const candidateState = readStoredResultVersion(username, candidateId);
  if (candidateState.status !== 'valid') {
    return fail(
      'RESULT_VERSION_CORRUPT',
      `Candidate result version "${candidateId}" is invalid or unreadable`,
    );
  }
  const candidate = candidateState.version;
  if (
    candidate.metadata.sequence !== loaded.index.nextSequence ||
    candidate.metadata.previousLatestVersionId !== loaded.index.latestVersionId
  ) {
    return fail(
      'RESULT_VERSION_CORRUPT',
      `Candidate result version "${candidateId}" does not follow the current index`,
    );
  }

  if (candidate.metadata.deliveryId === null) {
    recoverProtectedCandidate(username, loaded, candidate, current, now);
    return null;
  }
  if (candidate.metadata.deliveryId !== source.deliveryId) {
    return fail(
      'RESULT_DELIVERY_CONFLICT',
      `Pending delivery "${candidate.metadata.deliveryId}" must be reconciled before "${source.deliveryId}"`,
    );
  }
  return recoverGeneratedCandidate(
    username,
    loaded,
    candidate,
    current,
    result,
    resultHash,
    source,
    now,
  );
}

function recoverCommittedDelivery(
  username: string,
  loaded: LoadedResultVersions,
  current: CurrentResultState,
  resultHash: string,
  source: ResultVersionSource,
): ResultVersionMetadata | null {
  const metadata = loaded.index.versions.find(
    (version) => version.deliveryId === source.deliveryId,
  );
  if (!metadata) return null;
  const stored = loaded.versions.get(metadata.versionId);
  if (!stored || !sourceMatchesMetadata(source, metadata, resultHash)) {
    return fail(
      'RESULT_DELIVERY_CONFLICT',
      `Delivery "${source.deliveryId}" conflicts with its saved result version`,
    );
  }
  if (loaded.index.latestVersionId !== metadata.versionId) {
    return fail(
      'RESULT_DELIVERY_CONFLICT',
      `Delivery "${source.deliveryId}" is no longer the latest result version`,
    );
  }
  if (current.status === 'invalid') {
    return fail('RESULT_CURRENT_INVALID', 'Current result is invalid or unreadable');
  }
  if (current.status === 'missing') {
    writeDataFile(username, 'result', stored.result);
    return metadata;
  }
  if (current.hash !== metadata.resultHash) {
    return fail(
      'RESULT_CURRENT_DIVERGED',
      `Current result differs from delivery "${source.deliveryId}"`,
    );
  }
  return metadata;
}

function protectCurrentResult(
  username: string,
  loaded: LoadedResultVersions,
  current: CurrentResultState,
  now: string,
): Extract<CurrentResultState, { status: 'valid' }> | { status: 'missing' } {
  if (current.status === 'invalid') {
    return fail('RESULT_CURRENT_INVALID', 'Current result is invalid or unreadable');
  }
  if (current.status === 'missing') {
    if (loaded.index.latestVersionId === null) return current;
    const latest = loaded.versions.get(loaded.index.latestVersionId);
    if (!latest) {
      return fail('RESULT_VERSION_CORRUPT', 'Latest result version is unavailable');
    }
    writeDataFile(username, 'result', latest.result);
    return { status: 'valid', result: latest.result, hash: latest.metadata.resultHash };
  }

  const currentIsSaved = loaded.index.versions.some(
    (metadata) => metadata.resultHash === current.hash,
  );
  if (currentIsSaved) return current;

  const origin = loaded.indexWasMissing ? 'legacy' : 'untracked-current';
  const protectedVersion = buildProtectedVersion(username, loaded, current, origin, now);
  writeStoredResultVersion(username, protectedVersion);
  appendVersion(username, loaded, protectedVersion, now);
  return current;
}

function validateSaveInput(
  result: AIAnalysisResult,
  source: ResultVersionSource,
  now: string,
): string {
  if (!isAIAnalysisResult(result)) {
    throw new TypeError('AI result is invalid');
  }
  const resultHash = hashCanonicalJson(result);
  const preview = buildGeneratedVersion(
    {
      index: createEmptyIndex(now),
      indexWasMissing: true,
      versions: new Map(),
    },
    { status: 'missing' },
    result,
    resultHash,
    source,
    now,
  );
  if (!isResultVersionMetadata(preview.metadata)) {
    throw new TypeError('Result version source is invalid');
  }
  return resultHash;
}

function saveResultVersionUnderLock(
  username: string,
  result: AIAnalysisResult,
  resultHash: string,
  source: ResultVersionSource,
  now: string,
): ResultVersionMetadata {
  const loaded = loadResultVersions(username, now);
  let current = readCurrentResult(username);

  const committed = recoverCommittedDelivery(username, loaded, current, resultHash, source);
  if (committed) return committed;

  const recovered = recoverCandidate(username, loaded, current, result, resultHash, source, now);
  if (recovered) return recovered;

  current = readCurrentResult(username);
  const protectedCurrent = protectCurrentResult(username, loaded, current, now);
  const version = buildGeneratedVersion(loaded, protectedCurrent, result, resultHash, source, now);

  writeStoredResultVersion(username, version);
  writeDataFile(username, 'result', result);
  appendVersion(username, loaded, version, now);
  return version.metadata;
}

/**
 * Saves one successful AI result as an immutable version and current result.
 *
 * @param username - V2EX username that owns the result.
 * @param result - Complete validated AI analysis result.
 * @param source - Stable provider delivery and provenance metadata.
 * @returns The committed or idempotently recovered version metadata.
 * @throws {ResultVersionSaveError} When persisted state cannot advance safely.
 * @throws {TypeError} When the result or source is invalid.
 * @throws A lock, serialization, or filesystem error.
 */
export function saveResultVersion(
  username: string,
  result: AIAnalysisResult,
  source: ResultVersionSource,
): ResultVersionMetadata {
  const now = new Date().toISOString();
  const resultHash = validateSaveInput(result, source, now);
  return withResultVersionLock(username, () =>
    saveResultVersionUnderLock(username, result, resultHash, source, now),
  );
}
