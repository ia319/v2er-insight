import { isAIAnalysisResult, type AIAnalysisResult } from '@/core/ai';
import { hashCanonicalJson } from '@/core/provenance';
import {
  isResultVersionId,
  type ResultVersionDataQuality,
  type ResultVersionIndex,
  type ResultVersionMetadata,
  type ResultVersionOrigin,
  type ResultVersionProvider,
  type StoredResultVersion,
} from '@/core/result-version';
import { getDataFilePath } from './paths';
import { readJsonFileSnapshot, type JsonFileSnapshot, type ReadState } from './read-state';
import type { SelectedResult } from './result-query';
import {
  hasResultWriteLock,
  readResultCandidateIdsSnapshot,
  readResultLockSnapshot,
  readResultVersionIndexSnapshot,
  readStableResultSnapshot,
  readStoredResultVersionSnapshot,
  resultCandidateIdsMatchIndex,
  resultVersionMetadataMatches,
  type ResultCandidateIdsSnapshot,
  type ResultLockSnapshot,
} from './result-query-shared';

export interface ResultVersionSummary {
  versionId: string;
  sequence: number;
  origin: ResultVersionOrigin;
  createdAt: string | null;
  savedAt: string | null;
  provider: ResultVersionProvider;
  model: string | null;
  reasoningLevel: string | null;
  sessionName: string | null;
  dataQuality: ResultVersionDataQuality;
  warningCount: number | null;
  inputSummaryAvailable: boolean;
  isCurrent: boolean;
  virtual: boolean;
}

export type ResultArchiveCorruption =
  | { status: 'corrupt'; reason: 'missing' | 'invalid' | 'mismatched' }
  | { status: 'corrupt'; reason: 'unreadable'; error: unknown };

export type ResultHistoryQueryResult =
  | { status: 'empty' }
  | { status: 'busy' }
  | ResultArchiveCorruption
  | { status: 'success'; summaries: ResultVersionSummary[] };

export type ResultVersionQueryResult =
  | { status: 'not-found' }
  | { status: 'busy' }
  | ResultArchiveCorruption
  | { status: 'selected'; selection: SelectedResult };

interface ResultArchiveSnapshot {
  index: JsonFileSnapshot<ResultVersionIndex>;
  candidateIds: ResultCandidateIdsSnapshot;
  envelopes: Map<string, JsonFileSnapshot<StoredResultVersion>>;
  legacyCurrent: JsonFileSnapshot<AIAnalysisResult> | null;
  lock: ResultLockSnapshot;
  identity: string;
}

function readLegacyCurrentSnapshot(username: string): JsonFileSnapshot<AIAnalysisResult> {
  return readJsonFileSnapshot(getDataFilePath(username, 'result'), (value) =>
    isAIAnalysisResult(value) ? value : undefined,
  );
}

function createArchiveSnapshotIdentity(
  index: JsonFileSnapshot<ResultVersionIndex>,
  candidateIds: ResultCandidateIdsSnapshot,
  envelopes: Map<string, JsonFileSnapshot<StoredResultVersion>>,
  legacyCurrent: JsonFileSnapshot<AIAnalysisResult> | null,
  lock: ResultLockSnapshot,
): string {
  const envelopeIdentities = [...envelopes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([versionId, snapshot]) => [versionId, snapshot.identity]);
  return hashCanonicalJson({
    index: index.identity,
    candidateIds: candidateIds.identity,
    envelopes: envelopeIdentities,
    legacyCurrent: legacyCurrent?.identity ?? 'not-read',
    lock: lock.identity,
  });
}

function readHistorySnapshot(username: string): ResultArchiveSnapshot {
  const index = readResultVersionIndexSnapshot(username);
  const candidateIds = readResultCandidateIdsSnapshot(username);
  const envelopes = new Map<string, JsonFileSnapshot<StoredResultVersion>>();
  let legacyCurrent: JsonFileSnapshot<AIAnalysisResult> | null = null;

  if (index.state.status === 'valid') {
    for (const { versionId } of index.state.value.versions) {
      envelopes.set(versionId, readStoredResultVersionSnapshot(username, versionId));
    }
  } else if (
    index.state.status === 'missing' &&
    candidateIds.state.status === 'valid' &&
    candidateIds.state.value.length === 0
  ) {
    legacyCurrent = readLegacyCurrentSnapshot(username);
  }

  const lock = readResultLockSnapshot(username);
  return {
    index,
    candidateIds,
    envelopes,
    legacyCurrent,
    lock,
    identity: createArchiveSnapshotIdentity(index, candidateIds, envelopes, legacyCurrent, lock),
  };
}

function readVersionSnapshot(username: string, versionId: string): ResultArchiveSnapshot {
  const index = readResultVersionIndexSnapshot(username);
  const candidateIds = readResultCandidateIdsSnapshot(username);
  const envelopes = new Map<string, JsonFileSnapshot<StoredResultVersion>>();
  let legacyCurrent: JsonFileSnapshot<AIAnalysisResult> | null = null;

  if (
    index.state.status === 'valid' &&
    index.state.value.versions.some((metadata) => metadata.versionId === versionId)
  ) {
    envelopes.set(versionId, readStoredResultVersionSnapshot(username, versionId));
  } else if (
    versionId === 'v000001' &&
    index.state.status === 'missing' &&
    candidateIds.state.status === 'valid' &&
    candidateIds.state.value.length === 0
  ) {
    legacyCurrent = readLegacyCurrentSnapshot(username);
  }

  const lock = readResultLockSnapshot(username);
  return {
    index,
    candidateIds,
    envelopes,
    legacyCurrent,
    lock,
    identity: createArchiveSnapshotIdentity(index, candidateIds, envelopes, legacyCurrent, lock),
  };
}

function corruptionFromReadState<T>(state: ReadState<T>): ResultArchiveCorruption | null {
  switch (state.status) {
    case 'missing':
      return { status: 'corrupt', reason: 'missing' };
    case 'invalid':
      return { status: 'corrupt', reason: 'invalid' };
    case 'unreadable':
      return { status: 'corrupt', reason: 'unreadable', error: state.error };
    case 'valid':
      return null;
  }
}

function createVersionSummary(
  metadata: ResultVersionMetadata,
  envelope: StoredResultVersion,
  latestVersionId: string | null,
): ResultVersionSummary {
  return {
    versionId: metadata.versionId,
    sequence: metadata.sequence,
    origin: metadata.origin,
    createdAt: metadata.createdAt,
    savedAt: metadata.savedAt,
    provider: metadata.provider,
    model: metadata.model,
    reasoningLevel: metadata.reasoningLevel,
    sessionName: metadata.threadName ?? metadata.localSessionId,
    dataQuality: metadata.dataQuality,
    warningCount: metadata.warningCount,
    inputSummaryAvailable: envelope.inputSummary !== null,
    isCurrent: metadata.versionId === latestVersionId,
    virtual: false,
  };
}

function createLegacySummary(): ResultVersionSummary {
  return {
    versionId: 'v000001',
    sequence: 1,
    origin: 'legacy',
    createdAt: null,
    savedAt: null,
    provider: 'unknown',
    model: null,
    reasoningLevel: null,
    sessionName: null,
    dataQuality: 'unknown',
    warningCount: null,
    inputSummaryAvailable: false,
    isCurrent: true,
    virtual: true,
  };
}

function validateArchiveBase(
  snapshot: ResultArchiveSnapshot,
): ResultArchiveCorruption | { status: 'valid'; index: ResultVersionIndex } {
  const indexFailure = corruptionFromReadState(snapshot.index.state);
  if (indexFailure) return indexFailure;
  const candidateFailure = corruptionFromReadState(snapshot.candidateIds.state);
  if (candidateFailure) return candidateFailure;
  if (snapshot.index.state.status !== 'valid' || snapshot.candidateIds.state.status !== 'valid') {
    return { status: 'corrupt', reason: 'invalid' };
  }
  if (
    !resultCandidateIdsMatchIndex(snapshot.candidateIds.state.value, snapshot.index.state.value)
  ) {
    return { status: 'corrupt', reason: 'mismatched' };
  }
  return { status: 'valid', index: snapshot.index.state.value };
}

function classifyHistorySnapshot(snapshot: ResultArchiveSnapshot): ResultHistoryQueryResult {
  if (snapshot.index.state.status === 'missing') {
    if (
      snapshot.candidateIds.state.status !== 'valid' ||
      snapshot.candidateIds.state.value.length !== 0
    ) {
      const candidateFailure = corruptionFromReadState(snapshot.candidateIds.state);
      return candidateFailure ?? { status: 'corrupt', reason: 'mismatched' };
    }

    const currentState = snapshot.legacyCurrent?.state ?? { status: 'missing' as const };
    if (currentState.status === 'missing') return { status: 'empty' };
    const currentFailure = corruptionFromReadState(currentState);
    return currentFailure ?? { status: 'success', summaries: [createLegacySummary()] };
  }

  const archive = validateArchiveBase(snapshot);
  if (archive.status === 'corrupt') return archive;

  const summaries: ResultVersionSummary[] = [];
  for (const metadata of archive.index.versions) {
    const envelopeState = snapshot.envelopes.get(metadata.versionId)?.state ?? {
      status: 'missing' as const,
    };
    const envelopeFailure = corruptionFromReadState(envelopeState);
    if (envelopeFailure) return envelopeFailure;
    if (envelopeState.status !== 'valid') return { status: 'corrupt', reason: 'invalid' };
    if (!resultVersionMetadataMatches(envelopeState.value, metadata)) {
      return { status: 'corrupt', reason: 'mismatched' };
    }
    summaries.push(
      createVersionSummary(metadata, envelopeState.value, archive.index.latestVersionId),
    );
  }

  return summaries.length === 0
    ? { status: 'empty' }
    : { status: 'success', summaries: summaries.reverse() };
}

function classifyVersionSnapshot(
  username: string,
  versionId: string,
  snapshot: ResultArchiveSnapshot,
): ResultVersionQueryResult {
  if (snapshot.index.state.status === 'missing') {
    if (
      snapshot.candidateIds.state.status !== 'valid' ||
      snapshot.candidateIds.state.value.length !== 0
    ) {
      const candidateFailure = corruptionFromReadState(snapshot.candidateIds.state);
      return candidateFailure ?? { status: 'corrupt', reason: 'mismatched' };
    }
    if (versionId !== 'v000001') return { status: 'not-found' };

    const currentState = snapshot.legacyCurrent?.state ?? { status: 'missing' as const };
    if (currentState.status === 'missing') return { status: 'not-found' };
    const currentFailure = corruptionFromReadState(currentState);
    if (currentFailure) return currentFailure;
    if (currentState.status !== 'valid') return { status: 'corrupt', reason: 'invalid' };
    return {
      status: 'selected',
      selection: {
        username,
        source: 'legacy',
        result: currentState.value,
        metadata: null,
        inputSummary: null,
        archiveState: 'legacy-current',
        provenanceState: 'legacy-missing',
        verifiedCurrentResult: null,
        isCurrent: true,
      },
    };
  }

  const archive = validateArchiveBase(snapshot);
  if (archive.status === 'corrupt') return archive;
  const metadata = archive.index.versions.find((entry) => entry.versionId === versionId);
  if (!metadata) return { status: 'not-found' };

  const envelopeState = snapshot.envelopes.get(versionId)?.state ?? {
    status: 'missing' as const,
  };
  const envelopeFailure = corruptionFromReadState(envelopeState);
  if (envelopeFailure) return envelopeFailure;
  if (envelopeState.status !== 'valid') return { status: 'corrupt', reason: 'invalid' };
  if (!resultVersionMetadataMatches(envelopeState.value, metadata)) {
    return { status: 'corrupt', reason: 'mismatched' };
  }

  return {
    status: 'selected',
    selection: {
      username,
      source: 'version',
      result: envelopeState.value.result,
      metadata: envelopeState.value.metadata,
      inputSummary: envelopeState.value.inputSummary,
      archiveState: 'verified-history',
      provenanceState:
        metadata.origin === 'legacy' || metadata.origin === 'untracked-current'
          ? 'legacy-missing'
          : 'missing',
      verifiedCurrentResult: null,
      isCurrent: metadata.versionId === archive.index.latestVersionId,
    },
  };
}

function resolveStableArchiveResult<T extends ResultHistoryQueryResult | ResultVersionQueryResult>(
  snapshot: ResultArchiveSnapshot,
  result: T,
): T | { status: 'busy' } {
  return result.status === 'corrupt' && hasResultWriteLock(snapshot.lock)
    ? { status: 'busy' }
    : result;
}

/**
 * Lists every verified result version without reading current provenance or source data.
 *
 * @param username - V2EX username that owns the result archive.
 * @returns Reverse-ordered summaries or an explicit empty, corrupt, or busy state.
 */
export function queryResultHistory(username: string): ResultHistoryQueryResult {
  const stable = readStableResultSnapshot(() => readHistorySnapshot(username));
  if (stable.status === 'busy') return stable;
  return resolveStableArchiveResult(stable.snapshot, classifyHistorySnapshot(stable.snapshot));
}

/**
 * Selects one verified immutable result version or the read-only legacy projection.
 *
 * @param username - V2EX username that owns the result archive.
 * @param versionId - Canonical result version ID.
 * @returns Selected version or an explicit not-found, corrupt, or busy state.
 */
export function queryResultVersion(username: string, versionId: string): ResultVersionQueryResult {
  if (!isResultVersionId(versionId)) return { status: 'not-found' };
  const stable = readStableResultSnapshot(() => readVersionSnapshot(username, versionId));
  if (stable.status === 'busy') return stable;
  return resolveStableArchiveResult(
    stable.snapshot,
    classifyVersionSnapshot(username, versionId, stable.snapshot),
  );
}
