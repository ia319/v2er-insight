import { describe, expect, it } from 'vitest';
import type { AnalyzerOutput } from '@/core/analyzer';
import {
  checkAnalyzedProvenance,
  hasProviderReceivedAnalysis,
  recordProviderDelivery,
} from '../ai-delivery';
import { recordAnalyzedProvenance, recordRawProvenance } from '../state-transitions';
import type { AnalysisState } from '../state-types';
import type { RawSnapshotV2 } from '@/core/snapshot';

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
});
