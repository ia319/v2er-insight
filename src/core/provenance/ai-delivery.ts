import type { AnalyzerOutput } from '@/core/analyzer';
import type { AnalyzerConfig } from '@/config';
import {
  createResultDeliveryId,
  isResultDeliveryId,
  isResultVersionMetadata,
  type ResultVersionMetadata,
} from '@/core/result-version';
import {
  computeAnalysisConfigHash,
  computeAnalysisFingerprint,
  computePayloadHash,
} from './analysis-hash';
import type { AnalysisState, PendingResultDeliveryState, ResultDeliveryMode } from './state-types';

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

export type ResultDeliveryTarget = ProviderDeliveryRecordInput;

function matchesResultDeliveryTarget(
  pending: PendingResultDeliveryState,
  target: ResultDeliveryTarget,
): boolean {
  return (
    pending.providerKey === target.providerKey &&
    pending.analysisFingerprint === target.analysisFingerprint &&
    pending.payloadHash === target.payloadHash &&
    pending.basedOnPartial === target.basedOnPartial &&
    pending.deliveryMode === target.deliveryMode
  );
}

function assertAnalyzedIdentity(
  state: AnalysisState,
  input: Pick<ResultDeliveryTarget, 'analysisFingerprint' | 'payloadHash'>,
): void {
  if (
    state.analyzed?.analysisFingerprint !== input.analysisFingerprint ||
    state.analyzed.payloadHash !== input.payloadHash
  ) {
    throw new Error('analyzed provenance changed during AI delivery');
  }
}

/**
 * Checks whether saved metadata belongs to one durable pending delivery.
 *
 * @param metadata - Validated generated result metadata.
 * @param pending - Validated pending delivery state.
 * @returns Whether delivery, provider, analyzed input, mode, and quality agree.
 */
export function matchesPendingResultDelivery(
  metadata: ResultVersionMetadata,
  pending: PendingResultDeliveryState,
): boolean {
  const expectedOrigin = pending.deliveryMode === 'resend' ? 'resend' : 'analysis';
  const expectedProvider = pending.providerKey.startsWith('gemini:') ? 'gemini' : 'codex';
  const expectedDataQuality = pending.basedOnPartial ? 'partial' : 'complete';

  return (
    metadata.deliveryId === pending.deliveryId &&
    metadata.origin === expectedOrigin &&
    metadata.provider === expectedProvider &&
    metadata.analysisFingerprint === pending.analysisFingerprint &&
    metadata.payloadHash === pending.payloadHash &&
    metadata.dataQuality === expectedDataQuality
  );
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
 * Prepares or reuses the durable identity for one provider request.
 *
 * @param state - Latest validated analysis state.
 * @param target - Provider target and analyzed payload identity.
 * @param createDeliveryId - UUID factory used only when a new attempt is required.
 * @returns A new state containing the pending delivery, or the unchanged matching state.
 * @throws When analyzed provenance changed, a committed delivery remains pending, or the factory fails.
 */
export function prepareResultDelivery(
  state: AnalysisState,
  target: ResultDeliveryTarget,
  createDeliveryId: () => string = createResultDeliveryId,
): AnalysisState {
  assertAnalyzedIdentity(state, target);

  const pending = state.pendingResultDelivery;
  if (pending && matchesResultDeliveryTarget(pending, target)) {
    return state;
  }
  if (pending?.resultVersionId) {
    throw new Error(
      `result delivery "${pending.deliveryId}" must be completed before preparing another`,
    );
  }

  const deliveryId = createDeliveryId();
  if (!isResultDeliveryId(deliveryId)) {
    throw new TypeError('Result delivery ID factory returned an invalid UUID');
  }

  return {
    ...state,
    pendingResultDelivery: {
      deliveryId,
      ...target,
      resultVersionId: null,
    },
  };
}

/**
 * Links a durable result version to its pending provider delivery.
 *
 * @param state - Latest validated analysis state.
 * @param metadata - Metadata returned by the result version save service.
 * @returns A new state whose current result and pending delivery reference the saved version.
 * @throws When the metadata does not match the pending delivery.
 */
export function recordSavedResultVersion(
  state: AnalysisState,
  metadata: ResultVersionMetadata,
): AnalysisState {
  if (!isResultVersionMetadata(metadata)) {
    throw new TypeError('Saved result version metadata is invalid');
  }

  const pending = state.pendingResultDelivery;
  if (!pending || !matchesPendingResultDelivery(metadata, pending)) {
    throw new Error('saved result version does not match the pending AI delivery');
  }
  if (pending.resultVersionId && pending.resultVersionId !== metadata.versionId) {
    throw new Error('pending AI delivery already references a different result version');
  }

  const stale = state.analyzed?.analysisFingerprint !== pending.analysisFingerprint;
  return {
    ...state,
    pendingResultDelivery: {
      ...pending,
      resultVersionId: metadata.versionId,
    },
    currentResult: {
      analysisFingerprint: pending.analysisFingerprint,
      stale,
      basedOnPartial: pending.basedOnPartial,
      deliveryMode: pending.deliveryMode,
      resultVersionId: metadata.versionId,
    },
  };
}

/**
 * Advances provider provenance after result and provider-session state are durable.
 *
 * @param state - Latest validated analysis state.
 * @param deliveryId - Stable delivery ID shared with the saved result version.
 * @returns A new state with provider delivery recorded and the pending entry removed.
 * @throws When the delivery or current-result link is missing or inconsistent.
 */
export function completeResultDelivery(state: AnalysisState, deliveryId: string): AnalysisState {
  if (!isResultDeliveryId(deliveryId)) {
    throw new TypeError('Result delivery ID is invalid');
  }

  const pending = state.pendingResultDelivery;
  const current = state.currentResult;
  if (!pending || pending.deliveryId !== deliveryId || pending.resultVersionId === null) {
    throw new Error('saved AI delivery is not pending completion');
  }
  if (
    current?.analysisFingerprint !== pending.analysisFingerprint ||
    current.basedOnPartial !== pending.basedOnPartial ||
    current.deliveryMode !== pending.deliveryMode ||
    current.resultVersionId !== pending.resultVersionId
  ) {
    throw new Error('current result does not match the pending AI delivery');
  }

  const next: AnalysisState = {
    ...state,
    providers: {
      ...state.providers,
      [pending.providerKey]: {
        lastSentAnalysisFingerprint: pending.analysisFingerprint,
        lastSentPayloadHash: pending.payloadHash,
      },
    },
  };
  delete next.pendingResultDelivery;
  return next;
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
  assertAnalyzedIdentity(state, input);

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
