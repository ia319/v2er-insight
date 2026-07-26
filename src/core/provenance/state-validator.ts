import { isResultDeliveryId, isResultVersionId } from '@/core/result-version/identifiers';
import type {
  AnalysisStateV2,
  AnalysisStateV1,
  AnalyzedProvenanceState,
  CurrentResultState,
  LegacyCurrentResultState,
  PendingResultDeliveryState,
  ProviderProvenanceState,
  RawProvenanceState,
} from './state-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSha256Hash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isRawState(value: unknown): value is RawProvenanceState {
  return (
    isRecord(value) &&
    isSha256Hash(value.semanticDataHash) &&
    (value.captureStatus === 'complete' || value.captureStatus === 'partial')
  );
}

function isAnalyzedState(value: unknown): value is AnalyzedProvenanceState {
  return (
    isRecord(value) &&
    isSha256Hash(value.sourceSemanticHash) &&
    typeof value.analyzerSchemaVersion === 'number' &&
    Number.isSafeInteger(value.analyzerSchemaVersion) &&
    value.analyzerSchemaVersion > 0 &&
    isSha256Hash(value.analysisConfigHash) &&
    isSha256Hash(value.analysisFingerprint) &&
    isSha256Hash(value.payloadHash)
  );
}

function isDeliveryMode(value: unknown): boolean {
  return value === undefined || value === 'change' || value === 'resend';
}

function isLegacyCurrentResultState(value: unknown): value is LegacyCurrentResultState {
  return (
    isRecord(value) &&
    isSha256Hash(value.analysisFingerprint) &&
    typeof value.stale === 'boolean' &&
    typeof value.basedOnPartial === 'boolean' &&
    isDeliveryMode(value.deliveryMode)
  );
}

function isCurrentResultState(value: unknown): value is CurrentResultState {
  return (
    isRecord(value) &&
    isLegacyCurrentResultState(value) &&
    (value.resultVersionId === null || isResultVersionId(value.resultVersionId))
  );
}

function isPendingResultDeliveryState(value: unknown): value is PendingResultDeliveryState {
  return (
    isRecord(value) &&
    isResultDeliveryId(value.deliveryId) &&
    typeof value.providerKey === 'string' &&
    /^(?:gemini|codex):[a-f0-9]{64}$/.test(value.providerKey) &&
    isSha256Hash(value.analysisFingerprint) &&
    isSha256Hash(value.payloadHash) &&
    typeof value.basedOnPartial === 'boolean' &&
    isDeliveryMode(value.deliveryMode) &&
    value.deliveryMode !== undefined &&
    (value.resultVersionId === null || isResultVersionId(value.resultVersionId))
  );
}

function isProviderState(value: unknown): value is ProviderProvenanceState {
  return (
    isRecord(value) &&
    (value.lastSentAnalysisFingerprint === undefined ||
      isSha256Hash(value.lastSentAnalysisFingerprint)) &&
    (value.lastSentPayloadHash === undefined || isSha256Hash(value.lastSentPayloadHash))
  );
}

function isProvidersState(value: unknown): value is Record<string, ProviderProvenanceState> {
  return isRecord(value) && Object.values(value).every(isProviderState);
}

/**
 * Validates legacy analysis-state data before migration.
 *
 * @param value - Untrusted parsed sidecar value.
 * @returns Whether the value satisfies the v1 contract.
 */
export function isAnalysisStateV1(value: unknown): value is AnalysisStateV1 {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    (value.raw === undefined || isRawState(value.raw)) &&
    (value.analyzed === undefined || isAnalyzedState(value.analyzed)) &&
    (value.currentResult === undefined || isLegacyCurrentResultState(value.currentResult)) &&
    (value.providers === undefined || isProvidersState(value.providers))
  );
}

/**
 * Validates current analysis-state data before workflow access.
 *
 * @param value - Untrusted parsed or updated sidecar value.
 * @returns Whether the value satisfies the v2 contract.
 */
export function isAnalysisStateV2(value: unknown): value is AnalysisStateV2 {
  return (
    isRecord(value) &&
    value.schemaVersion === 2 &&
    (value.raw === undefined || isRawState(value.raw)) &&
    (value.analyzed === undefined || isAnalyzedState(value.analyzed)) &&
    (value.currentResult === undefined || isCurrentResultState(value.currentResult)) &&
    (value.pendingResultDelivery === undefined ||
      isPendingResultDeliveryState(value.pendingResultDelivery)) &&
    (value.providers === undefined || isProvidersState(value.providers))
  );
}

/**
 * Converts a validated v1 sidecar without inventing a result version ID.
 *
 * @param state - Validated legacy analysis state.
 * @returns The equivalent current state.
 */
export function migrateAnalysisStateV1(state: AnalysisStateV1): AnalysisStateV2 {
  return {
    schemaVersion: 2,
    ...(state.raw ? { raw: state.raw } : {}),
    ...(state.analyzed ? { analyzed: state.analyzed } : {}),
    ...(state.currentResult
      ? { currentResult: { ...state.currentResult, resultVersionId: null } }
      : {}),
    ...(state.providers ? { providers: state.providers } : {}),
  };
}
