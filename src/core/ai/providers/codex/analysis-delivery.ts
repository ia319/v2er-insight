import type {
  CodexPendingAnalysisDelivery,
  PrepareCodexAnalysisDeliveryInput,
} from './thread-state';

/**
 * Compares a pending delivery with the complete identity captured before submission.
 * @param pending - Persisted delivery with its optional accepted turn ID.
 * @param delivery - Delivery identity being prepared, sent, or cancelled.
 * @returns Whether every immutable delivery field matches.
 */
export function matchesCodexAnalysisDelivery(
  pending: CodexPendingAnalysisDelivery,
  delivery: PrepareCodexAnalysisDeliveryInput,
): boolean {
  return (
    pending.deliveryId === delivery.deliveryId &&
    pending.providerKey === delivery.providerKey &&
    pending.analysisFingerprint === delivery.analysisFingerprint &&
    pending.payloadHash === delivery.payloadHash &&
    pending.basedOnPartial === delivery.basedOnPartial &&
    pending.deliveryMode === delivery.deliveryMode &&
    pending.reasoningEffort === delivery.reasoningEffort
  );
}
