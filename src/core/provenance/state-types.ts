/** Persistent analysis-state schema version. */
export const ANALYSIS_STATE_SCHEMA_VERSION = 1 as const;

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

export interface CurrentResultState {
  analysisFingerprint: string;
  stale: boolean;
  basedOnPartial: boolean;
  deliveryMode?: ResultDeliveryMode;
}

export interface ProviderProvenanceState {
  lastSentAnalysisFingerprint?: string;
  lastSentPayloadHash?: string;
}

/** Durable provenance and provider delivery state for one user. */
export interface AnalysisStateV1 {
  schemaVersion: typeof ANALYSIS_STATE_SCHEMA_VERSION;
  raw?: RawProvenanceState;
  analyzed?: AnalyzedProvenanceState;
  currentResult?: CurrentResultState;
  providers?: Record<string, ProviderProvenanceState>;
}
