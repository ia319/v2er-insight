import { describe, expect, it, vi } from 'vitest';
import {
  isCodexAnalysisResultApplicable,
  planCodexAnalysisDelivery,
  type CodexAnalysisDeliveryTarget,
} from '../analysis-delivery';
import type { CodexPendingAnalysisDelivery } from '../thread-state';

const HASH = 'a'.repeat(64);

const TARGET: CodexAnalysisDeliveryTarget = {
  providerKey: `codex:${HASH}`,
  analysisFingerprint: HASH,
  payloadHash: HASH,
  basedOnPartial: false,
  deliveryMode: 'change',
  reasoningEffort: 'high',
};

function createPending(
  overrides: Partial<CodexPendingAnalysisDelivery> = {},
): CodexPendingAnalysisDelivery {
  return { deliveryId: 'delivery-1', ...TARGET, turnId: null, ...overrides };
}

describe('planCodexAnalysisDelivery', () => {
  it('should create an attempt when no delivery is pending', () => {
    const createDeliveryId = vi.fn(() => 'delivery-2');

    expect(planCodexAnalysisDelivery(undefined, TARGET, createDeliveryId)).toEqual({
      kind: 'create',
      delivery: { ...TARGET, deliveryId: 'delivery-2' },
    });
    expect(createDeliveryId).toHaveBeenCalledOnce();
  });

  it('should reuse the identity of a matching unaccepted attempt', () => {
    const createDeliveryId = vi.fn(() => 'delivery-2');

    expect(planCodexAnalysisDelivery(createPending(), TARGET, createDeliveryId)).toEqual({
      kind: 'reuse',
      delivery: { ...TARGET, deliveryId: 'delivery-1' },
    });
    expect(createDeliveryId).not.toHaveBeenCalled();
  });

  it('should replace a different unaccepted attempt', () => {
    const pending = createPending({ payloadHash: 'b'.repeat(64) });

    expect(planCodexAnalysisDelivery(pending, TARGET, () => 'delivery-2')).toEqual({
      kind: 'replace',
      pending,
      delivery: { ...TARGET, deliveryId: 'delivery-2' },
    });
  });

  it('should recover every accepted attempt before considering current data', () => {
    const pending = createPending({ payloadHash: 'b'.repeat(64), turnId: 'turn-1' });
    const createDeliveryId = vi.fn(() => 'delivery-2');

    expect(planCodexAnalysisDelivery(pending, TARGET, createDeliveryId)).toEqual({
      kind: 'recover',
      pending,
    });
    expect(createDeliveryId).not.toHaveBeenCalled();
  });
});

describe('isCodexAnalysisResultApplicable', () => {
  it('should ignore attempt ID, turn ID, and original delivery mode', () => {
    expect(
      isCodexAnalysisResultApplicable(
        createPending({ deliveryMode: 'resend', turnId: 'turn-1' }),
        TARGET,
      ),
    ).toBe(true);
  });

  it('should reject a result for different data or reasoning effort', () => {
    expect(
      isCodexAnalysisResultApplicable(createPending({ payloadHash: 'b'.repeat(64) }), TARGET),
    ).toBe(false);
    expect(isCodexAnalysisResultApplicable(createPending({ reasoningEffort: 'low' }), TARGET)).toBe(
      false,
    );
  });
});
