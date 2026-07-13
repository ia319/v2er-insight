import type {
  AnalysisStateV1,
  AnalyzedProvenanceState,
  CurrentResultState,
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

function isCurrentResultState(value: unknown): value is CurrentResultState {
  return (
    isRecord(value) &&
    isSha256Hash(value.analysisFingerprint) &&
    typeof value.stale === 'boolean' &&
    typeof value.basedOnPartial === 'boolean' &&
    (value.deliveryMode === undefined ||
      value.deliveryMode === 'change' ||
      value.deliveryMode === 'resend')
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

/** Validate parsed analysis-state.json data before it enters the workflow. */
export function isAnalysisStateV1(value: unknown): value is AnalysisStateV1 {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    (value.raw === undefined || isRawState(value.raw)) &&
    (value.analyzed === undefined || isAnalyzedState(value.analyzed)) &&
    (value.currentResult === undefined || isCurrentResultState(value.currentResult)) &&
    (value.providers === undefined || isProvidersState(value.providers))
  );
}
