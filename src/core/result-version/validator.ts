import { isAIAnalysisResult } from '@/core/ai';
import { ANALYZER_OUTPUT_SCHEMA_VERSION, isAnalyzerOutput } from '@/core/analyzer';
import { hashCanonicalJson } from '@/core/provenance/canonical-json';
import { formatResultVersionId, isResultDeliveryId, isResultVersionId } from './identifiers';
import {
  RESULT_VERSION_INDEX_SCHEMA_VERSION,
  STORED_RESULT_VERSION_SCHEMA_VERSION,
  type ResultInputSummary,
  type ResultVersionIndex,
  type ResultVersionMetadata,
  type StoredResultVersion,
} from './types';

const METADATA_KEYS = [
  'versionId',
  'sequence',
  'origin',
  'deliveryId',
  'previousLatestVersionId',
  'previousCurrentHash',
  'createdAt',
  'savedAt',
  'provider',
  'model',
  'reasoningLevel',
  'localSessionId',
  'externalThreadId',
  'threadName',
  'promptHash',
  'analysisFingerprint',
  'payloadHash',
  'resultHash',
  'dataQuality',
  'warningCount',
  'appVersion',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isSha256Hash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableHash(value: unknown): value is string | null {
  return value === null || isSha256Hash(value);
}

function isNullableVersionId(value: unknown): value is string | null {
  return value === null || isResultVersionId(value);
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0);
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isNullableIsoTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestamp(value);
}

function hasValidSharedMetadata(value: Record<string, unknown>): boolean {
  return (
    hasExactKeys(value, METADATA_KEYS) &&
    isResultVersionId(value.versionId) &&
    Number.isSafeInteger(value.sequence) &&
    (value.sequence as number) > 0 &&
    formatResultVersionId(value.sequence as number) === value.versionId &&
    isNullableVersionId(value.previousLatestVersionId) &&
    isNullableHash(value.previousCurrentHash) &&
    isNullableIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.savedAt) &&
    isNullableNonEmptyString(value.model) &&
    isNullableNonEmptyString(value.reasoningLevel) &&
    isNullableNonEmptyString(value.localSessionId) &&
    isNullableNonEmptyString(value.externalThreadId) &&
    isNullableNonEmptyString(value.threadName) &&
    isNullableHash(value.promptHash) &&
    isNullableHash(value.analysisFingerprint) &&
    isNullableHash(value.payloadHash) &&
    isSha256Hash(value.resultHash) &&
    (value.warningCount === null ||
      (Number.isSafeInteger(value.warningCount) && (value.warningCount as number) >= 0)) &&
    isNullableNonEmptyString(value.appVersion)
  );
}

function hasValidGeneratedMetadata(value: Record<string, unknown>): boolean {
  return (
    (value.origin === 'analysis' || value.origin === 'resend') &&
    isResultDeliveryId(value.deliveryId) &&
    (value.provider === 'gemini' || value.provider === 'codex') &&
    value.createdAt !== null &&
    value.model !== null &&
    value.promptHash !== null &&
    value.analysisFingerprint !== null &&
    value.payloadHash !== null &&
    (value.dataQuality === 'complete' || value.dataQuality === 'partial') &&
    value.warningCount !== null &&
    value.appVersion !== null
  );
}

function hasValidProtectedMetadata(value: Record<string, unknown>): boolean {
  return (
    (value.origin === 'legacy' || value.origin === 'untracked-current') &&
    value.deliveryId === null &&
    value.provider === 'unknown' &&
    value.model === null &&
    value.reasoningLevel === null &&
    value.localSessionId === null &&
    value.externalThreadId === null &&
    value.threadName === null &&
    value.promptHash === null &&
    value.analysisFingerprint === null &&
    value.payloadHash === null &&
    value.dataQuality === 'unknown' &&
    value.warningCount === null
  );
}

/**
 * Validates one result version summary before it enters storage logic.
 *
 * @param value - Untrusted metadata value.
 * @returns Whether the value satisfies the complete metadata contract.
 */
export function isResultVersionMetadata(value: unknown): value is ResultVersionMetadata {
  return (
    isRecord(value) &&
    hasValidSharedMetadata(value) &&
    (hasValidGeneratedMetadata(value) || hasValidProtectedMetadata(value))
  );
}

/**
 * Validates the deterministic Analyzer facts stored beside one generated result.
 * @param value - Untrusted input summary value.
 * @returns Whether the value satisfies the complete persisted summary contract.
 */
export function isResultInputSummary(value: unknown): value is ResultInputSummary {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'username',
      'analyzerConfig',
      'dataQuality',
      'userOverview',
      'activitySummary',
    ]) ||
    typeof value.username !== 'string' ||
    value.username.length === 0 ||
    !isRecord(value.analyzerConfig) ||
    !hasExactKeys(value.analyzerConfig, ['inactivityThresholdDays', 'nodeDistributionTopN']) ||
    !isFiniteNumber(value.analyzerConfig.inactivityThresholdDays) ||
    !isFiniteNumber(value.analyzerConfig.nodeDistributionTopN)
  ) {
    return false;
  }

  return isAnalyzerOutput({
    schemaVersion: ANALYZER_OUTPUT_SCHEMA_VERSION,
    dataQuality: value.dataQuality,
    userOverview: value.userOverview,
    summary: value.activitySummary,
    contents: [],
  });
}

/**
 * Validates one immutable result version and its canonical payload hashes.
 * @param value - Untrusted stored result value.
 * @returns Whether the complete envelope satisfies the persisted contract.
 */
export function isStoredResultVersion(value: unknown): value is StoredResultVersion {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'metadata',
      'inputSummary',
      'inputSummaryHash',
      'result',
    ]) ||
    value.schemaVersion !== STORED_RESULT_VERSION_SCHEMA_VERSION ||
    !isResultVersionMetadata(value.metadata) ||
    !isAIAnalysisResult(value.result) ||
    hashCanonicalJson(value.result) !== value.metadata.resultHash
  ) {
    return false;
  }

  const generated = value.metadata.origin === 'analysis' || value.metadata.origin === 'resend';
  return generated
    ? isResultInputSummary(value.inputSummary) &&
        isSha256Hash(value.inputSummaryHash) &&
        hashCanonicalJson(value.inputSummary) === value.inputSummaryHash
    : value.inputSummary === null && value.inputSummaryHash === null;
}

/**
 * Validates the complete ordered result version index.
 *
 * @param value - Untrusted index value.
 * @returns Whether every index entry and sequence invariant is valid.
 */
export function isResultVersionIndex(value: unknown): value is ResultVersionIndex {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'nextSequence',
      'latestVersionId',
      'versions',
      'updatedAt',
    ]) ||
    value.schemaVersion !== RESULT_VERSION_INDEX_SCHEMA_VERSION ||
    !Number.isSafeInteger(value.nextSequence) ||
    (value.nextSequence as number) < 1 ||
    !isNullableVersionId(value.latestVersionId) ||
    !Array.isArray(value.versions) ||
    !value.versions.every(isResultVersionMetadata) ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return false;
  }

  const versions = value.versions;
  if (value.nextSequence !== versions.length + 1) return false;
  if (versions.length === 0) return value.latestVersionId === null;
  if (value.latestVersionId !== versions[versions.length - 1]?.versionId) return false;

  const deliveryIds = new Set<string>();
  for (const [index, version] of versions.entries()) {
    if (version.sequence !== index + 1) return false;
    if (version.previousLatestVersionId !== (versions[index - 1]?.versionId ?? null)) return false;
    if (version.deliveryId !== null) {
      if (deliveryIds.has(version.deliveryId)) return false;
      deliveryIds.add(version.deliveryId);
    }
  }

  return true;
}
