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
  AnalysisStateV1,
  AnalyzedProvenanceState,
  CaptureStatus,
  RawProvenanceState,
} from './state-types';

function deriveCaptureStatus(snapshot: RawSnapshotV2): CaptureStatus {
  return snapshot.topics.status === 'complete' && snapshot.replies.status === 'complete'
    ? 'complete'
    : 'partial';
}

/** Record the semantic identity and completeness of a persisted raw snapshot. */
export function recordRawProvenance(
  state: AnalysisStateV1,
  snapshot: RawSnapshotV2,
): AnalysisStateV1 & { raw: RawProvenanceState } {
  return {
    ...state,
    raw: {
      semanticDataHash: computeSemanticDataHash(snapshot),
      captureStatus: deriveCaptureStatus(snapshot),
    },
  };
}

/** Record Analyzer provenance and recompute current-result freshness. */
export function recordAnalyzedProvenance(
  state: AnalysisStateV1,
  snapshot: RawSnapshotV2,
  output: AnalyzerOutput,
  config?: AnalyzerConfig,
): AnalysisStateV1 & { analyzed: AnalyzedProvenanceState } {
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
