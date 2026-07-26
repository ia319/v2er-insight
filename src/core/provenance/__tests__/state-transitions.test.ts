import { describe, expect, it } from 'vitest';

import type { AnalyzerOutput } from '@/core/analyzer';
import type { RawSnapshotV2 } from '@/core/snapshot';
import { computeSemanticDataHash } from '../semantic-hash';
import { recordAnalyzedProvenance, recordRawProvenance } from '../state-transitions';
import type { AnalysisState } from '../state-types';

const HASH = 'a'.repeat(64);

function createSnapshot(): RawSnapshotV2 {
  return {
    schemaVersion: 2,
    username: 'alice',
    capturedAt: '2026-07-12T03:04:05.000Z',
    profile: { joinDate: '2020-01-01 00:00:00 +08:00', dailyRanking: null },
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
      capturedAt: '2026-07-12T03:04:05.000Z',
      topics: { status: 'complete', totalExpected: 0, fetchedCount: 0, failedCount: 0 },
      replies: { status: 'complete', totalExpected: 0, fetchedCount: 0, failedCount: 0 },
    },
    userOverview: {
      joinDate: '2020-01-01 00:00:00 +08:00',
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

describe('recordRawProvenance', () => {
  it('records complete capture identity without discarding unrelated state', () => {
    const state: AnalysisState = {
      schemaVersion: 2,
      providers: { gemini: { lastSentPayloadHash: HASH } },
    };
    const snapshot = createSnapshot();

    const next = recordRawProvenance(state, snapshot);

    expect(next.raw).toEqual({
      semanticDataHash: computeSemanticDataHash(snapshot),
      captureStatus: 'complete',
    });
    expect(next.providers).toEqual(state.providers);
  });

  it.each(['partial', 'not_requested'] as const)(
    'marks %s collection scopes as a partial capture',
    (status) => {
      const snapshot = createSnapshot();
      snapshot.replies = {
        ...snapshot.replies,
        status,
        totalExpected: null,
      };

      expect(recordRawProvenance({ schemaVersion: 2 }, snapshot).raw.captureStatus).toBe('partial');
    },
  );

  it('marks the current result stale when a new raw identity replaces its analyzed source', () => {
    const existing = recordAnalyzedProvenance(
      recordRawProvenance({ schemaVersion: 2 }, createSnapshot()),
      createSnapshot(),
      createOutput(),
    );
    const state: AnalysisState = {
      ...existing,
      currentResult: {
        analysisFingerprint: existing.analyzed.analysisFingerprint,
        stale: false,
        basedOnPartial: false,
        resultVersionId: null,
      },
    };
    const changedSnapshot = createSnapshot();
    changedSnapshot.profile.joinDate = '2021-01-01 00:00:00 +08:00';

    const next = recordRawProvenance(state, changedSnapshot);

    expect(next.currentResult?.stale).toBe(true);
  });

  it('keeps the current result freshness when a repeated raw identity is recorded', () => {
    const snapshot = createSnapshot();
    const existing = recordAnalyzedProvenance(
      recordRawProvenance({ schemaVersion: 2 }, snapshot),
      snapshot,
      createOutput(),
    );
    const state: AnalysisState = {
      ...existing,
      currentResult: {
        analysisFingerprint: existing.analyzed.analysisFingerprint,
        stale: false,
        basedOnPartial: false,
        resultVersionId: null,
      },
    };

    expect(recordRawProvenance(state, snapshot).currentResult?.stale).toBe(false);
  });
});

describe('recordAnalyzedProvenance', () => {
  it('records all analyzed hashes and marks a different current result stale', () => {
    const state: AnalysisState = {
      schemaVersion: 2,
      currentResult: {
        analysisFingerprint: HASH,
        stale: false,
        basedOnPartial: false,
        resultVersionId: null,
      },
    };

    const next = recordAnalyzedProvenance(state, createSnapshot(), createOutput());

    expect(next.analyzed).toMatchObject({
      analyzerSchemaVersion: 2,
      sourceSemanticHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      analysisConfigHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      analysisFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(next.currentResult).toEqual({ ...state.currentResult, stale: true });
  });

  it('keeps a result fresh when its analysis fingerprint still matches', () => {
    const first = recordAnalyzedProvenance({ schemaVersion: 2 }, createSnapshot(), createOutput());
    const state: AnalysisState = {
      ...first,
      currentResult: {
        analysisFingerprint: first.analyzed.analysisFingerprint,
        stale: true,
        basedOnPartial: false,
        resultVersionId: null,
      },
    };

    expect(
      recordAnalyzedProvenance(state, createSnapshot(), createOutput()).currentResult?.stale,
    ).toBe(false);
  });

  it('changes analysis identity for semantic config without using chunk limits', () => {
    const baseline = recordAnalyzedProvenance(
      { schemaVersion: 2 },
      createSnapshot(),
      createOutput(),
    );
    const semanticChange = recordAnalyzedProvenance(
      { schemaVersion: 2 },
      createSnapshot(),
      createOutput(),
      { inactivityThreshold: 30 },
    );
    const layoutChange = recordAnalyzedProvenance(
      { schemaVersion: 2 },
      createSnapshot(),
      createOutput(),
      { chunkMaxTopics: 1, chunkMaxReplies: 1 },
    );

    expect(semanticChange.analyzed.analysisFingerprint).not.toBe(
      baseline.analyzed.analysisFingerprint,
    );
    expect(layoutChange.analyzed.analysisFingerprint).toBe(baseline.analyzed.analysisFingerprint);
  });
});
