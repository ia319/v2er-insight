import { describe, expect, it } from 'vitest';
import type { AnalyzerOutput } from '@/core/analyzer';
import {
  checkAnalyzedProvenance,
  completeResultDelivery,
  hasProviderReceivedAnalysis,
  prepareResultDelivery,
  recordProviderDelivery,
  recordSavedResultVersion,
} from '../ai-delivery';
import { recordAnalyzedProvenance, recordRawProvenance } from '../state-transitions';
import type { AnalysisState } from '../state-types';
import type { RawSnapshotV2 } from '@/core/snapshot';
import type { ResultVersionMetadata } from '@/core/result-version';

const DELIVERY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_DELIVERY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createSnapshot(): RawSnapshotV2 {
  return {
    schemaVersion: 2,
    username: 'alice',
    capturedAt: '2026-07-13T00:00:00.000Z',
    profile: { joinDate: '2020-01-01', dailyRanking: null },
    topics: {
      status: 'complete',
      totalExpected: 0,
      fetchedCount: 0,
      failedCount: 0,
      failedPageCount: 0,
      identityFailureCount: 0,
      duplicateConflictCount: 0,
      hidden: false,
      items: [],
    },
    replies: {
      status: 'complete',
      totalExpected: 0,
      fetchedCount: 0,
      failedCount: 0,
      failedPageCount: 0,
      identityFailureCount: 0,
      duplicateConflictCount: 0,
      items: [],
    },
  };
}

function createOutput(): AnalyzerOutput {
  return {
    schemaVersion: 2,
    dataQuality: {
      capturedAt: '2026-07-13T00:00:00.000Z',
      topics: { status: 'complete', totalExpected: 0, fetchedCount: 0, failedCount: 0 },
      replies: { status: 'complete', totalExpected: 0, fetchedCount: 0, failedCount: 0 },
    },
    userOverview: {
      joinDate: '2020-01-01',
      lastActiveTime: 'unknown',
      topicReplyRatio: null,
      totalTopics: 0,
      totalReplies: 0,
      isTopicsHidden: false,
      dailyRanking: null,
    },
    summary: { totalPeriods: 0, periods: [] },
    contents: [],
  };
}

function createState(output = createOutput()): AnalysisState {
  const snapshot = createSnapshot();
  const withRaw = recordRawProvenance({ schemaVersion: 2 }, snapshot);
  return recordAnalyzedProvenance(withRaw, snapshot, output);
}

function createDeliveryTarget(state: AnalysisState) {
  if (!state.analyzed) throw new Error('Expected analyzed fixture provenance');
  return {
    providerKey: `gemini:${'c'.repeat(64)}`,
    analysisFingerprint: state.analyzed.analysisFingerprint,
    payloadHash: state.analyzed.payloadHash,
    basedOnPartial: false,
    deliveryMode: 'change' as const,
  };
}

function createVersionMetadata(
  state: AnalysisState,
  overrides: Partial<ResultVersionMetadata> = {},
): ResultVersionMetadata {
  if (!state.pendingResultDelivery) throw new Error('Expected pending fixture delivery');
  const pending = state.pendingResultDelivery;
  return {
    versionId: 'v000001',
    sequence: 1,
    origin: pending.deliveryMode === 'resend' ? 'resend' : 'analysis',
    deliveryId: pending.deliveryId,
    previousLatestVersionId: null,
    previousCurrentHash: null,
    createdAt: '2026-07-13T01:00:00.000Z',
    savedAt: '2026-07-13T01:01:00.000Z',
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    reasoningLevel: 'high',
    localSessionId: null,
    externalThreadId: null,
    threadName: null,
    promptHash: 'd'.repeat(64),
    analysisFingerprint: pending.analysisFingerprint,
    payloadHash: pending.payloadHash,
    resultHash: 'e'.repeat(64),
    dataQuality: pending.basedOnPartial ? 'partial' : 'complete',
    warningCount: 0,
    appVersion: '1.2.0',
    ...overrides,
  };
}

describe('checkAnalyzedProvenance', () => {
  it('returns reusable delivery identity for matching state and output', () => {
    const output = createOutput();
    const result = checkAnalyzedProvenance(createState(output), output);

    expect(result).toMatchObject({
      status: 'valid',
      analysisFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      basedOnPartial: false,
    });
  });

  it('distinguishes missing provenance from mismatched provenance', () => {
    const output = createOutput();
    const state = createState(output);
    if (!state.analyzed) {
      throw new Error('Expected analyzed fixture provenance');
    }

    expect(checkAnalyzedProvenance({ schemaVersion: 2 }, output)).toEqual({ status: 'missing' });
    expect(
      checkAnalyzedProvenance(
        {
          ...state,
          analyzed: { ...state.analyzed, payloadHash: 'a'.repeat(64) },
        },
        output,
      ),
    ).toEqual({ status: 'mismatch' });
  });

  it('rejects changed semantic Analyzer configuration', () => {
    const output = createOutput();

    expect(
      checkAnalyzedProvenance(createState(output), output, { inactivityThreshold: 30 }),
    ).toEqual({ status: 'mismatch' });
  });
});

describe('provider delivery state', () => {
  it('skips only the matching provider target and fingerprint', () => {
    const state: AnalysisState = {
      schemaVersion: 2,
      providers: {
        target: { lastSentAnalysisFingerprint: 'a'.repeat(64) },
      },
    };

    expect(hasProviderReceivedAnalysis(state, 'target', 'a'.repeat(64))).toBe(true);
    expect(hasProviderReceivedAnalysis(state, 'other', 'a'.repeat(64))).toBe(false);
    expect(hasProviderReceivedAnalysis(state, 'target', 'b'.repeat(64))).toBe(false);
  });

  it('records a successful resend without discarding other providers', () => {
    const output = createOutput();
    const state = createState(output);
    const checked = checkAnalyzedProvenance(state, output);
    if (checked.status !== 'valid') {
      throw new Error('Expected valid fixture provenance');
    }
    state.providers = { existing: { lastSentPayloadHash: 'c'.repeat(64) } };

    const next = recordProviderDelivery(state, {
      providerKey: 'target',
      analysisFingerprint: checked.analysisFingerprint,
      payloadHash: checked.payloadHash,
      basedOnPartial: checked.basedOnPartial,
      deliveryMode: 'resend',
    });

    expect(next.providers?.existing).toEqual(state.providers.existing);
    expect(next.providers?.target).toEqual({
      lastSentAnalysisFingerprint: checked.analysisFingerprint,
      lastSentPayloadHash: checked.payloadHash,
    });
    expect(next.currentResult).toEqual({
      analysisFingerprint: checked.analysisFingerprint,
      stale: false,
      basedOnPartial: false,
      deliveryMode: 'resend',
      resultVersionId: null,
    });
  });

  it('rejects a state that changed while delivery was running', () => {
    const state = createState();

    expect(() =>
      recordProviderDelivery(state, {
        providerKey: 'target',
        analysisFingerprint: 'a'.repeat(64),
        payloadHash: 'b'.repeat(64),
        basedOnPartial: false,
        deliveryMode: 'change',
      }),
    ).toThrow('analyzed provenance changed');
  });

  it('prepares one stable delivery ID before provider access', () => {
    const state = createState();
    const target = createDeliveryTarget(state);
    const prepared = prepareResultDelivery(state, target, () => DELIVERY_ID);

    expect(prepared.pendingResultDelivery).toEqual({
      deliveryId: DELIVERY_ID,
      ...target,
      resultVersionId: null,
    });
    expect(prepareResultDelivery(prepared, target, () => OTHER_DELIVERY_ID)).toBe(prepared);
  });

  it('replaces only an uncommitted delivery when the target changes', () => {
    const state = createState();
    const target = createDeliveryTarget(state);
    const prepared = prepareResultDelivery(state, target, () => DELIVERY_ID);
    const replacement = prepareResultDelivery(
      prepared,
      { ...target, deliveryMode: 'resend' },
      () => OTHER_DELIVERY_ID,
    );

    expect(replacement.pendingResultDelivery?.deliveryId).toBe(OTHER_DELIVERY_ID);
    expect(replacement.pendingResultDelivery?.deliveryMode).toBe('resend');

    const saved = recordSavedResultVersion(prepared, createVersionMetadata(prepared));
    expect(() =>
      prepareResultDelivery(saved, { ...target, deliveryMode: 'resend' }, () => OTHER_DELIVERY_ID),
    ).toThrow('must be completed');
  });

  it('links a saved version before completing provider delivery', () => {
    const state = createState();
    const prepared = prepareResultDelivery(state, createDeliveryTarget(state), () => DELIVERY_ID);
    const metadata = createVersionMetadata(prepared);
    const saved = recordSavedResultVersion(prepared, metadata);

    expect(saved.pendingResultDelivery?.resultVersionId).toBe('v000001');
    expect(saved.currentResult).toEqual({
      analysisFingerprint: prepared.pendingResultDelivery?.analysisFingerprint,
      stale: false,
      basedOnPartial: false,
      deliveryMode: 'change',
      resultVersionId: 'v000001',
    });

    const completed = completeResultDelivery(saved, DELIVERY_ID);
    expect(completed.pendingResultDelivery).toBeUndefined();
    expect(completed.providers?.[prepared.pendingResultDelivery!.providerKey]).toEqual({
      lastSentAnalysisFingerprint: prepared.pendingResultDelivery?.analysisFingerprint,
      lastSentPayloadHash: prepared.pendingResultDelivery?.payloadHash,
    });
  });

  it('rejects saved metadata from another delivery identity', () => {
    const state = createState();
    const prepared = prepareResultDelivery(state, createDeliveryTarget(state), () => DELIVERY_ID);

    expect(() =>
      recordSavedResultVersion(
        prepared,
        createVersionMetadata(prepared, { deliveryId: OTHER_DELIVERY_ID }),
      ),
    ).toThrow('does not match');
  });
});
