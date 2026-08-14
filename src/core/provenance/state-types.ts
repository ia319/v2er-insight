/** Persistent analysis-state schema version. */
export const ANALYSIS_STATE_LEGACY_SCHEMA_VERSION = 1 as const;
export const ANALYSIS_STATE_SCHEMA_VERSION = 2 as const;

export type CaptureStatus = 'complete' | 'partial';
export type ResultDeliveryMode = 'change' | 'resend';

export interface RawProvenanceState {
  semanticDataHash: string;
  captureStatus: CaptureStatus;
}

export interface AnalyzedProvenanceState {
  sourceSemanticHash: string;
  analyzerSchemaVersion: number;
  analysisConfigHash: string;
  analysisFingerprint: string;
  payloadHash: string;
}

export interface LegacyCurrentResultState {
  analysisFingerprint: string;
  stale: boolean;
  basedOnPartial: boolean;
  deliveryMode?: ResultDeliveryMode;
}

export interface CurrentResultState extends LegacyCurrentResultState {
  resultVersionId: string | null;
}

export interface ProviderProvenanceState {
  lastSentAnalysisFingerprint?: string;
  lastSentPayloadHash?: string;
}

export interface PendingResultDeliveryState {
  deliveryId: string;
  providerKey: string;
  analysisFingerprint: string;
  payloadHash: string;
  inputSummaryHash: string;
  basedOnPartial: boolean;
  deliveryMode: ResultDeliveryMode;
  resultVersionId: string | null;
}

/** Legacy durable provenance state accepted for migration only. */
export interface AnalysisStateV1 {
  schemaVersion: typeof ANALYSIS_STATE_LEGACY_SCHEMA_VERSION;
  raw?: RawProvenanceState;
  analyzed?: AnalyzedProvenanceState;
  currentResult?: LegacyCurrentResultState;
  providers?: Record<string, ProviderProvenanceState>;
}

/** Durable provenance, result version, and provider delivery state for one user. */
export interface AnalysisStateV2 {
  schemaVersion: typeof ANALYSIS_STATE_SCHEMA_VERSION;
  raw?: RawProvenanceState;
  analyzed?: AnalyzedProvenanceState;
  currentResult?: CurrentResultState;
  pendingResultDelivery?: PendingResultDeliveryState;
  providers?: Record<string, ProviderProvenanceState>;
}

export type AnalysisState = AnalysisStateV2;
