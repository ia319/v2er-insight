import type { AnalyzerOutput } from '@/core/analyzer';
import type { AnalyzerConfig } from '@/config';
import {
  computeAnalysisConfigHash,
  computeAnalysisFingerprint,
  computePayloadHash,
} from './analysis-hash';
import type { AnalysisState, ResultDeliveryMode } from './state-types';

export type AnalyzedProvenanceCheck =
  | { status: 'missing' }
  | { status: 'mismatch' }
  | {
      status: 'valid';
      analysisFingerprint: string;
      payloadHash: string;
      basedOnPartial: boolean;
    };

export interface ProviderDeliveryRecordInput {
  providerKey: string;
  analysisFingerprint: string;
  payloadHash: string;
  basedOnPartial: boolean;
  deliveryMode: ResultDeliveryMode;
}

/**
 * Verifies analyzed.json against its durable source and configuration identity.
 *
 * @param state - Validated analysis-state.json value.
 * @param output - Validated AnalyzerOutput V2 read from analyzed.json.
 * @param config - Current Analyzer settings that affect semantic output.
 * @returns A typed status with reusable delivery identity when valid.
 */
export function checkAnalyzedProvenance(
  state: AnalysisState,
  output: AnalyzerOutput,
  config?: AnalyzerConfig,
): AnalyzedProvenanceCheck {
  if (!state.raw || !state.analyzed) {
    return { status: 'missing' };
  }

  const analysisConfigHash = computeAnalysisConfigHash(config);
  const analysisFingerprint = computeAnalysisFingerprint({
    semanticDataHash: state.analyzed.sourceSemanticHash,
    analyzerSchemaVersion: output.schemaVersion,
    analysisConfigHash,
  });
  const payloadHash = computePayloadHash(output);
  const outputIsPartial =
    output.dataQuality.topics.status !== 'complete' ||
    output.dataQuality.replies.status !== 'complete';
  const stateIsPartial = state.raw.captureStatus === 'partial';

  if (
    state.analyzed.sourceSemanticHash !== state.raw.semanticDataHash ||
    state.analyzed.analyzerSchemaVersion !== output.schemaVersion ||
    state.analyzed.analysisConfigHash !== analysisConfigHash ||
    state.analyzed.analysisFingerprint !== analysisFingerprint ||
    state.analyzed.payloadHash !== payloadHash ||
    stateIsPartial !== outputIsPartial
  ) {
    return { status: 'mismatch' };
  }

  return {
    status: 'valid',
    analysisFingerprint,
    payloadHash,
    basedOnPartial: stateIsPartial,
  };
}

/**
 * Determines whether one logical provider target already received the current analysis.
 *
 * @param state - Validated delivery state.
 * @param providerKey - Stable logical provider target key.
 * @param analysisFingerprint - Current semantic analysis identity.
 * @returns Whether a normal send can be skipped.
 */
export function hasProviderReceivedAnalysis(
  state: AnalysisState,
  providerKey: string,
  analysisFingerprint: string,
): boolean {
  return state.providers?.[providerKey]?.lastSentAnalysisFingerprint === analysisFingerprint;
}

/**
 * Advances provider and current-result provenance after result.json is durable.
 *
 * @param state - Latest validated analysis state.
 * @param input - Delivery identity and result quality metadata.
 * @returns A new state with the successful delivery recorded.
 * @throws When analyzed provenance changed while the provider request was in flight.
 */
export function recordProviderDelivery(
  state: AnalysisState,
  input: ProviderDeliveryRecordInput,
): AnalysisState {
  if (
    state.analyzed?.analysisFingerprint !== input.analysisFingerprint ||
    state.analyzed.payloadHash !== input.payloadHash
  ) {
    throw new Error('analyzed provenance changed during AI delivery');
  }

  return {
    ...state,
    providers: {
      ...state.providers,
      [input.providerKey]: {
        lastSentAnalysisFingerprint: input.analysisFingerprint,
        lastSentPayloadHash: input.payloadHash,
      },
    },
    currentResult: {
      analysisFingerprint: input.analysisFingerprint,
      stale: false,
      basedOnPartial: input.basedOnPartial,
      deliveryMode: input.deliveryMode,
      resultVersionId: null,
    },
  };
}
