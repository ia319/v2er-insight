import type { AnalyzerOutput } from '@/core/analyzer';
import type { AnalyzerConfig } from '@/config';
import type { RawSnapshotV2 } from '@/core/snapshot';
import {
  computeAnalysisConfigHash,
  computeAnalysisFingerprint,
  computePayloadHash,
} from './analysis-hash';
import { computeSemanticDataHash } from './semantic-hash';
import type {
  AnalysisState,
  AnalyzedProvenanceState,
  CaptureStatus,
  RawProvenanceState,
} from './state-types';

function deriveCaptureStatus(snapshot: RawSnapshotV2): CaptureStatus {
  return snapshot.topics.status === 'complete' && snapshot.replies.status === 'complete'
    ? 'complete'
    : 'partial';
}

/**
 * Records the semantic identity and completeness of a persisted raw snapshot.
 *
 * @param state - Current validated analysis state.
 * @param snapshot - Persisted raw snapshot.
 * @returns A new state with raw provenance and updated result freshness.
 */
export function recordRawProvenance(
  state: AnalysisState,
  snapshot: RawSnapshotV2,
): AnalysisState & { raw: RawProvenanceState } {
  const raw: RawProvenanceState = {
    semanticDataHash: computeSemanticDataHash(snapshot),
    captureStatus: deriveCaptureStatus(snapshot),
  };
  const next = {
    ...state,
    raw,
  };

  return state.currentResult &&
    state.analyzed &&
    state.analyzed.sourceSemanticHash !== raw.semanticDataHash
    ? {
        ...next,
        currentResult: {
          ...state.currentResult,
          stale: true,
        },
      }
    : next;
}

/**
 * Records Analyzer provenance and recomputes current-result freshness.
 *
 * @param state - Current validated analysis state.
 * @param snapshot - Raw snapshot consumed by the analyzer.
 * @param output - Persisted analyzer output.
 * @param config - Analyzer settings that affect semantic output.
 * @returns A new state with analyzed provenance and updated result freshness.
 */
export function recordAnalyzedProvenance(
  state: AnalysisState,
  snapshot: RawSnapshotV2,
  output: AnalyzerOutput,
  config?: AnalyzerConfig,
): AnalysisState & { analyzed: AnalyzedProvenanceState } {
  const sourceSemanticHash = computeSemanticDataHash(snapshot);
  const analysisConfigHash = computeAnalysisConfigHash(config);
  const analysisFingerprint = computeAnalysisFingerprint({
    semanticDataHash: sourceSemanticHash,
    analyzerSchemaVersion: output.schemaVersion,
    analysisConfigHash,
  });
  const analyzed: AnalyzedProvenanceState = {
    sourceSemanticHash,
    analyzerSchemaVersion: output.schemaVersion,
    analysisConfigHash,
    analysisFingerprint,
    payloadHash: computePayloadHash(output),
  };

  const next = {
    ...state,
    analyzed,
  };

  return state.currentResult
    ? {
        ...next,
        currentResult: {
          ...state.currentResult,
          stale: state.currentResult.analysisFingerprint !== analysisFingerprint,
        },
      }
    : next;
}
