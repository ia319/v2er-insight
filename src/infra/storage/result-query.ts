import { isAIAnalysisResult, type AIAnalysisResult } from '@/core/ai';
import {
  isAnalysisStateV2,
  hashCanonicalJson,
  type AnalysisState,
  type CurrentResultState,
} from '@/core/provenance';
import {
  type ResultInputSummary,
  type ResultVersionIndex,
  type ResultVersionMetadata,
  type StoredResultVersion,
} from '@/core/result-version';
import { getDataFilePath } from './paths';
import { readJsonFileSnapshot, type JsonFileSnapshot, type ReadState } from './read-state';
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

export type ResultArchiveState =
  | 'verified-current'
  | 'verified-history'
  | 'legacy-current'
  | 'tracked-current-diverged'
  | 'untracked-current'
  | 'unavailable';

export type ResultProvenanceState =
  | 'verified'
  | 'legacy-missing'
  | 'missing'
  | 'invalid'
  | 'mismatched';

export interface SelectedResult {
  username: string;
  source: 'current' | 'version' | 'legacy';
  result: AIAnalysisResult;
  metadata: ResultVersionMetadata | null;
  inputSummary: ResultInputSummary | null;
  archiveState: ResultArchiveState;
  provenanceState: ResultProvenanceState;
  verifiedCurrentResult: CurrentResultState | null;
  isCurrent: boolean | null;
}

export type CurrentResultQueryResult =
  | { status: 'missing'; latestVersionId: string | null }
  | { status: 'invalid'; reason: 'json' | 'contract' }
  | { status: 'invalid'; reason: 'unreadable'; error: unknown }
  | { status: 'busy' }
  | { status: 'selected'; selection: SelectedResult };

interface CurrentQuerySnapshot {
  current: JsonFileSnapshot<AIAnalysisResult>;
  index: JsonFileSnapshot<ResultVersionIndex>;
  candidateIds: ResultCandidateIdsSnapshot;
  analysisState: JsonFileSnapshot<AnalysisState>;
  envelopes: Map<string, JsonFileSnapshot<StoredResultVersion>>;
  associatedVersionId: string | null;
  lock: ResultLockSnapshot;
  identity: string;
}

interface ClassifiedSnapshot {
  result: CurrentResultQueryResult;
  associationComplete: boolean;
}

function parseAnalysisState(value: unknown): AnalysisState | undefined {
  return isAnalysisStateV2(value) ? value : undefined;
}

function readCurrentQuerySnapshot(username: string): CurrentQuerySnapshot {
  const current = readJsonFileSnapshot(getDataFilePath(username, 'result'), (value) =>
    isAIAnalysisResult(value) ? value : undefined,
  );
  const index = readResultVersionIndexSnapshot(username);
  const candidateIds = readResultCandidateIdsSnapshot(username);
  const envelopes = new Map<string, JsonFileSnapshot<StoredResultVersion>>();

  const readEnvelope = (versionId: string): JsonFileSnapshot<StoredResultVersion> => {
    const existing = envelopes.get(versionId);
    if (existing) return existing;
    const snapshot = readStoredResultVersionSnapshot(username, versionId);
    envelopes.set(versionId, snapshot);
    return snapshot;
  };

  if (index.state.status === 'valid' && index.state.value.latestVersionId !== null) {
    readEnvelope(index.state.value.latestVersionId);
  }

  const analysisState = readJsonFileSnapshot(
    getDataFilePath(username, 'analysisState'),
    parseAnalysisState,
  );
  let associatedVersionId: string | null = null;

  if (current.state.status === 'valid' && index.state.status === 'valid') {
    const currentValue = current.state.value;
    const indexValue = index.state.value;
    const currentHash = hashCanonicalJson(currentValue);
    const matches = indexValue.versions.filter((metadata) => metadata.resultHash === currentHash);
    const latestMatch = matches.find(
      (metadata) => metadata.versionId === indexValue.latestVersionId,
    );
    const currentResultVersionId =
      analysisState.state.status === 'valid'
        ? analysisState.state.value.currentResult?.resultVersionId
        : undefined;
    const provenanceMatch =
      currentResultVersionId !== undefined
        ? matches.find((metadata) => metadata.versionId === currentResultVersionId)
        : undefined;
    associatedVersionId = latestMatch?.versionId ?? provenanceMatch?.versionId ?? null;
    if (associatedVersionId === null && matches.length === 1) {
      associatedVersionId = matches[0]?.versionId ?? null;
    }
    if (associatedVersionId !== null) readEnvelope(associatedVersionId);
  }

  const lock = readResultLockSnapshot(username);
  const envelopeIdentities = [...envelopes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([versionId, snapshot]) => [versionId, snapshot.identity]);
  const identity = hashCanonicalJson({
    current: current.identity,
    index: index.identity,
    candidateIds: candidateIds.identity,
    analysisState: analysisState.identity,
    envelopes: envelopeIdentities,
    lock: lock.identity,
  });

  return {
    current,
    index,
    candidateIds,
    analysisState,
    envelopes,
    associatedVersionId,
    lock,
    identity,
  };
}

function hasCoherentArchive(snapshot: CurrentQuerySnapshot): boolean {
  if (snapshot.index.state.status !== 'valid' || snapshot.candidateIds.state.status !== 'valid') {
    return false;
  }

  const index = snapshot.index.state.value;
  if (!resultCandidateIdsMatchIndex(snapshot.candidateIds.state.value, index)) {
    return false;
  }
  if (index.latestVersionId === null) return true;

  const latestMetadata = index.versions[index.versions.length - 1];
  const latestEnvelope = snapshot.envelopes.get(index.latestVersionId)?.state;
  return (
    latestMetadata !== undefined &&
    latestEnvelope?.status === 'valid' &&
    resultVersionMetadataMatches(latestEnvelope.value, latestMetadata)
  );
}

function resolveProvenance(
  archiveState: ResultArchiveState,
  metadata: ResultVersionMetadata | null,
  analysisState: ReadState<AnalysisState>,
): Pick<SelectedResult, 'provenanceState' | 'verifiedCurrentResult'> {
  if (
    archiveState === 'legacy-current' ||
    metadata?.origin === 'legacy' ||
    metadata?.origin === 'untracked-current'
  ) {
    return { provenanceState: 'legacy-missing', verifiedCurrentResult: null };
  }
  if (analysisState.status === 'missing') {
    return { provenanceState: 'missing', verifiedCurrentResult: null };
  }
  if (analysisState.status === 'invalid' || analysisState.status === 'unreadable') {
    return { provenanceState: 'invalid', verifiedCurrentResult: null };
  }

  const currentResult = analysisState.value.currentResult;
  if (!currentResult) {
    return { provenanceState: 'missing', verifiedCurrentResult: null };
  }
  if (metadata === null) {
    return { provenanceState: 'mismatched', verifiedCurrentResult: null };
  }

  const expectedDeliveryMode = metadata.origin === 'resend' ? 'resend' : 'change';
  const matches =
    currentResult.resultVersionId === metadata.versionId &&
    currentResult.analysisFingerprint === metadata.analysisFingerprint &&
    currentResult.basedOnPartial === (metadata.dataQuality === 'partial') &&
    currentResult.deliveryMode === expectedDeliveryMode;
  return matches
    ? { provenanceState: 'verified', verifiedCurrentResult: currentResult }
    : { provenanceState: 'mismatched', verifiedCurrentResult: null };
}

function createSelection(
  username: string,
  snapshot: CurrentQuerySnapshot,
  result: AIAnalysisResult,
  archiveState: ResultArchiveState,
  metadata: ResultVersionMetadata | null,
  inputSummary: ResultInputSummary | null,
): SelectedResult {
  const provenance = resolveProvenance(archiveState, metadata, snapshot.analysisState.state);
  return {
    username,
    source: archiveState === 'legacy-current' ? 'legacy' : 'current',
    result,
    metadata,
    inputSummary,
    archiveState,
    ...provenance,
    isCurrent:
      archiveState === 'verified-current' || archiveState === 'legacy-current'
        ? true
        : archiveState === 'tracked-current-diverged'
          ? false
          : null,
  };
}

function classifyCurrentSnapshot(
  username: string,
  snapshot: CurrentQuerySnapshot,
): ClassifiedSnapshot {
  const currentState = snapshot.current.state;
  if (currentState.status === 'invalid') {
    return {
      result: { status: 'invalid', reason: currentState.reason },
      associationComplete: true,
    };
  }
  if (currentState.status === 'unreadable') {
    return {
      result: { status: 'invalid', reason: 'unreadable', error: currentState.error },
      associationComplete: true,
    };
  }

  const archiveCoherent = hasCoherentArchive(snapshot);
  if (currentState.status === 'missing') {
    const latestVersionId = archiveCoherent
      ? snapshot.index.state.status === 'valid'
        ? snapshot.index.state.value.latestVersionId
        : null
      : null;
    const archiveEmpty =
      (snapshot.index.state.status === 'missing' &&
        snapshot.candidateIds.state.status === 'valid' &&
        snapshot.candidateIds.state.value.length === 0) ||
      (archiveCoherent && latestVersionId === null);
    return {
      result: { status: 'missing', latestVersionId },
      associationComplete: archiveEmpty,
    };
  }

  const result = currentState.value;
  if (
    snapshot.index.state.status === 'missing' &&
    snapshot.candidateIds.state.status === 'valid' &&
    snapshot.candidateIds.state.value.length === 0
  ) {
    const selection = createSelection(username, snapshot, result, 'legacy-current', null, null);
    return { result: { status: 'selected', selection }, associationComplete: true };
  }

  if (!archiveCoherent || snapshot.index.state.status !== 'valid') {
    const selection = createSelection(username, snapshot, result, 'unavailable', null, null);
    return { result: { status: 'selected', selection }, associationComplete: false };
  }

  const index = snapshot.index.state.value;
  const currentHash = hashCanonicalJson(result);
  const matches = index.versions.filter((metadata) => metadata.resultHash === currentHash);
  if (matches.length === 0) {
    const selection = createSelection(username, snapshot, result, 'untracked-current', null, null);
    return { result: { status: 'selected', selection }, associationComplete: false };
  }

  const associatedMetadata =
    snapshot.associatedVersionId === null
      ? null
      : (matches.find(({ versionId }) => versionId === snapshot.associatedVersionId) ?? null);
  const associatedEnvelope =
    associatedMetadata === null
      ? null
      : snapshot.envelopes.get(associatedMetadata.versionId)?.state;
  if (
    associatedMetadata !== null &&
    (associatedEnvelope?.status !== 'valid' ||
      !resultVersionMetadataMatches(associatedEnvelope.value, associatedMetadata))
  ) {
    const selection = createSelection(username, snapshot, result, 'unavailable', null, null);
    return { result: { status: 'selected', selection }, associationComplete: false };
  }

  const latest = associatedMetadata?.versionId === index.latestVersionId;
  const archiveState: ResultArchiveState = latest ? 'verified-current' : 'tracked-current-diverged';
  const selection = createSelection(
    username,
    snapshot,
    result,
    archiveState,
    associatedMetadata,
    associatedEnvelope?.status === 'valid' ? associatedEnvelope.value.inputSummary : null,
  );
  const provenanceConsistent =
    selection.provenanceState === 'verified' || selection.provenanceState === 'legacy-missing';
  return {
    result: { status: 'selected', selection },
    associationComplete: latest && provenanceConsistent,
  };
}

/**
 * Resolves the current result from a bounded, read-only storage snapshot.
 *
 * @param username - V2EX username that owns the displayed result.
 * @returns A selected result or an explicit missing, invalid, or busy state.
 */
export function queryCurrentResult(username: string): CurrentResultQueryResult {
  const stable = readStableResultSnapshot(() => readCurrentQuerySnapshot(username));
  if (stable.status === 'busy') return stable;

  const classified = classifyCurrentSnapshot(username, stable.snapshot);
  return !classified.associationComplete && hasResultWriteLock(stable.snapshot.lock)
    ? { status: 'busy' }
    : classified.result;
}
