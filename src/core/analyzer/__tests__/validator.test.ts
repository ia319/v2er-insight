import { describe, expect, it } from 'vitest';
import type { AnalyzerOutput } from '../types';
import { isAnalyzerOutput } from '../validator';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected test fixture to be an object');
  }
  return value as Record<string, unknown>;
}

function createOutput(): AnalyzerOutput {
  return {
    schemaVersion: 2,
    dataQuality: {
      capturedAt: '2026-07-13T00:00:00.000Z',
      topics: { status: 'complete', totalExpected: 1, fetchedCount: 1, failedCount: 0 },
      replies: { status: 'partial', totalExpected: 2, fetchedCount: 1, failedCount: 1 },
    },
    userOverview: {
      joinDate: '2020-01-01',
      lastActiveTime: '2026-07-13',
      topicReplyRatio: 1,
      totalTopics: 1,
      totalReplies: 1,
      isTopicsHidden: false,
      dailyRanking: null,
    },
    summary: {
      totalPeriods: 1,
      periods: [
        {
          timeRange: '2026-07-01 - 2026-07-13',
          topicCount: 1,
          avgTopicReplyCount: 2,
          avgTopicClickCount: 3,
          avgTopicLifecycleDays: 1,
          topicInteractionRatio: 2,
          topicHourDistribution: { 12: 1 },
          topicNodeDistribution: { general: 1 },
          replyCount: 1,
          avgReplyLength: 5,
          directReplyRatio: 0,
          avgReplyPosition: 1,
          replyWeekdayDistribution: { Monday: 1 },
          replyNodeDistribution: { general: 1 },
        },
      ],
    },
    contents: [
      {
        periodIndex: 0,
        chunkIndex: 0,
        totalChunksInPeriod: 1,
        topics: [{ title: 'Topic', nodeName: 'general', content: 'Body' }],
        replies: [{ topicTitle: 'Topic', nodeName: 'general', content: 'Reply' }],
      },
    ],
  };
}

describe('isAnalyzerOutput', () => {
  it('accepts a complete AnalyzerOutput V2 value', () => {
    expect(isAnalyzerOutput(createOutput())).toBe(true);
  });

  it.each([
    {
      field: 'schemaVersion',
      mutate: (output: Record<string, unknown>) => (output.schemaVersion = 1),
    },
    {
      field: 'quality status',
      mutate: (output: Record<string, unknown>) => {
        const dataQuality = output.dataQuality as Record<string, unknown>;
        dataQuality.topics = {
          status: 'unknown',
          totalExpected: 1,
          fetchedCount: 1,
          failedCount: 0,
        };
      },
    },
    {
      field: 'user overview',
      mutate: (output: Record<string, unknown>) => {
        const overview = output.userOverview as Record<string, unknown>;
        overview.totalTopics = -1;
      },
    },
    {
      field: 'period stats',
      mutate: (output: Record<string, unknown>) => {
        const summary = output.summary as { periods: Array<Record<string, unknown>> };
        summary.periods[0]!.avgReplyLength = Number.NaN;
      },
    },
    {
      field: 'content chunk',
      mutate: (output: Record<string, unknown>) => {
        const contents = output.contents as Array<Record<string, unknown>>;
        delete contents[0]!.totalChunksInPeriod;
      },
    },
  ])('rejects invalid $field data', ({ mutate }) => {
    const output: unknown = structuredClone(createOutput());
    mutate(asRecord(output));

    expect(isAnalyzerOutput(output)).toBe(false);
  });
});
