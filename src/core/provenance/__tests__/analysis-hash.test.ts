import { describe, expect, it } from 'vitest';

import type { AnalyzerOutput } from '@/core/analyzer';
import { ANALYZER_OUTPUT_SCHEMA_VERSION } from '@/core/analyzer';
import {
  computeAnalysisConfigHash,
  computeAnalysisFingerprint,
  computePayloadHash,
} from '../analysis-hash';

function createOutput(): AnalyzerOutput {
  return {
    schemaVersion: 2,
    dataQuality: {
      capturedAt: '2026-07-12T03:04:05.000Z',
      topics: {
        status: 'complete',
        totalExpected: 1,
        fetchedCount: 1,
        failedCount: 0,
      },
      replies: {
        status: 'complete',
        totalExpected: 1,
        fetchedCount: 1,
        failedCount: 0,
      },
    },
    userOverview: {
      joinDate: '2020-01-02 03:04:05 +08:00',
      lastActiveTime: '2026-07-12T00:04:05.000Z',
      topicReplyRatio: 1,
      totalTopics: 1,
      totalReplies: 1,
      isTopicsHidden: false,
      dailyRanking: 42,
    },
    summary: {
      totalPeriods: 0,
      periods: [],
    },
    contents: [],
  };
}

describe('computeAnalysisConfigHash', () => {
  it('uses resolved semantic defaults', () => {
    expect(computeAnalysisConfigHash()).toBe(
      computeAnalysisConfigHash({ inactivityThreshold: 60, nodeDistributionTopN: 3 }),
    );
  });

  it.each([{ inactivityThreshold: 30 }, { nodeDistributionTopN: 5 }])(
    'changes for semantic config $config',
    (config) => {
      expect(computeAnalysisConfigHash(config)).not.toBe(computeAnalysisConfigHash());
    },
  );

  it('ignores content chunk limits', () => {
    expect(computeAnalysisConfigHash({ chunkMaxTopics: 1, chunkMaxReplies: 1 })).toBe(
      computeAnalysisConfigHash({ chunkMaxTopics: 500, chunkMaxReplies: 500 }),
    );
  });
});

describe('computeAnalysisFingerprint', () => {
  const baseline = {
    semanticDataHash: 'a'.repeat(64),
    analyzerSchemaVersion: ANALYZER_OUTPUT_SCHEMA_VERSION,
    analysisConfigHash: 'b'.repeat(64),
  };

  it('is stable for the same inputs', () => {
    expect(computeAnalysisFingerprint(baseline)).toBe(computeAnalysisFingerprint({ ...baseline }));
  });

  it.each([
    { semanticDataHash: 'c'.repeat(64) },
    { analyzerSchemaVersion: ANALYZER_OUTPUT_SCHEMA_VERSION + 1 },
    { analysisConfigHash: 'd'.repeat(64) },
  ])('changes when an identity component changes', (change) => {
    expect(computeAnalysisFingerprint({ ...baseline, ...change })).not.toBe(
      computeAnalysisFingerprint(baseline),
    );
  });
});

describe('computePayloadHash', () => {
  it('hashes the complete Analyzer output', () => {
    const output = createOutput();
    const changed = createOutput();
    changed.dataQuality.capturedAt = '2026-07-13T03:04:05.000Z';

    expect(computePayloadHash(output)).toMatch(/^[a-f0-9]{64}$/);
    expect(computePayloadHash(changed)).not.toBe(computePayloadHash(output));
  });
});
