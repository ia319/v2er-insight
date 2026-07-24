import type {
  CodexPendingAnalysisDelivery,
  PrepareCodexAnalysisDeliveryInput,
} from './thread-state';

export type CodexAnalysisDeliveryTarget = Omit<PrepareCodexAnalysisDeliveryInput, 'deliveryId'>;

export type CodexAnalysisDeliveryPlan =
  | { kind: 'create'; delivery: PrepareCodexAnalysisDeliveryInput }
  | { kind: 'reuse'; delivery: PrepareCodexAnalysisDeliveryInput }
  | {
      kind: 'replace';
      pending: CodexPendingAnalysisDelivery;
      delivery: PrepareCodexAnalysisDeliveryInput;
    }
  | { kind: 'recover'; pending: CodexPendingAnalysisDelivery };

/**
 * Compares every current target field while excluding attempt and external turn IDs.
 * @param pending - Persisted delivery with attempt and external turn metadata.
 * @param target - Current provider, analysis, quality, mode, and effort target.
 * @returns Whether the unaccepted delivery can be reused for the target.
 */
export function matchesCodexAnalysisDeliveryTarget(
  pending: CodexPendingAnalysisDelivery,
  target: CodexAnalysisDeliveryTarget,
): boolean {
  return (
    pending.providerKey === target.providerKey &&
    pending.analysisFingerprint === target.analysisFingerprint &&
    pending.payloadHash === target.payloadHash &&
    pending.basedOnPartial === target.basedOnPartial &&
    pending.deliveryMode === target.deliveryMode &&
    pending.reasoningEffort === target.reasoningEffort
  );
}

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

/**
 * Checks whether a recovered result satisfies the current provider and analysis target.
 * @param pending - Delivery identity attached to the recovered result.
 * @param target - Current provider, analysis, quality, mode, and effort target.
 * @returns Whether the result applies to the current target independent of attempt metadata.
 */
export function isCodexAnalysisResultApplicable(
  pending: CodexPendingAnalysisDelivery,
  target: CodexAnalysisDeliveryTarget,
): boolean {
  return (
    pending.providerKey === target.providerKey &&
    pending.analysisFingerprint === target.analysisFingerprint &&
    pending.payloadHash === target.payloadHash &&
    pending.basedOnPartial === target.basedOnPartial &&
    pending.reasoningEffort === target.reasoningEffort
  );
}

/**
 * Selects the safe action for a current target and optional pending delivery.
 * @param pending - Persisted delivery, if the session has one.
 * @param target - Current immutable delivery fields apart from the attempt ID.
 * @param createDeliveryId - Factory for a new locally unique attempt ID.
 * @returns A create, reuse, replace, or accepted-turn recovery plan.
 */
export function planCodexAnalysisDelivery(
  pending: CodexPendingAnalysisDelivery | undefined,
  target: CodexAnalysisDeliveryTarget,
  createDeliveryId: () => string,
): CodexAnalysisDeliveryPlan {
  if (pending !== undefined && pending.turnId !== null) {
    return { kind: 'recover', pending };
  }
  if (pending && matchesCodexAnalysisDeliveryTarget(pending, target)) {
    return { kind: 'reuse', delivery: { ...target, deliveryId: pending.deliveryId } };
  }

  const delivery = { ...target, deliveryId: createDeliveryId() };
  return pending ? { kind: 'replace', pending, delivery } : { kind: 'create', delivery };
}
