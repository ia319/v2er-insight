import { describe, expect, it } from 'vitest';
import type { AnalyzerOutput } from '@/core/analyzer';
import { createResultInputSummary } from '../input-summary';

function createAnalyzerOutput(): AnalyzerOutput {
  return {
    schemaVersion: 2,
    dataQuality: {
      capturedAt: '2026-08-13T08:00:00.000Z',
      topics: { status: 'complete', totalExpected: 1, fetchedCount: 1, failedCount: 0 },
      replies: { status: 'complete', totalExpected: 1, fetchedCount: 1, failedCount: 0 },
    },
    userOverview: {
      joinDate: '2020-01-01',
      lastActiveTime: '2026-08-12',
      topicReplyRatio: 1,
      totalTopics: 1,
      totalReplies: 1,
      isTopicsHidden: false,
      dailyRanking: 42,
    },
    summary: {
      totalPeriods: 1,
      periods: [
        {
          timeRange: '2026-08-01 - 2026-08-12',
          topicCount: 1,
          avgTopicReplyCount: 2,
          avgTopicClickCount: 10,
          avgTopicLifecycleDays: 1,
          topicInteractionRatio: 0.5,
          topicHourDistribution: { 8: 1 },
          topicNodeDistribution: { qna: 1 },
          replyCount: 1,
          avgReplyLength: 20,
          directReplyRatio: 0,
          avgRepliedTopicHeat: 2,
          replyWeekdayDistribution: { Tuesday: 1 },
          replyNodeDistribution: { qna: 1 },
        },
      ],
    },
    contents: [
      {
        periodIndex: 0,
        topics: [{ title: 'Private title', nodeName: 'qna', content: 'Private topic' }],
        replies: [{ topicTitle: 'Private title', nodeName: 'qna', content: 'Private reply' }],
      },
    ],
  };
}

describe('createResultInputSummary', () => {
  it('archives deterministic facts without content bodies', () => {
    const output = createAnalyzerOutput();

    const summary = createResultInputSummary('alice', output, {
      inactivityThreshold: 30,
      nodeDistributionTopN: 5,
      chunkMaxTopics: 1,
      chunkMaxReplies: 1,
    });

    expect(summary).toEqual({
      username: 'alice',
      analyzerConfig: { inactivityThresholdDays: 30, nodeDistributionTopN: 5 },
      dataQuality: output.dataQuality,
      userOverview: output.userOverview,
      activitySummary: output.summary,
    });
  });
});
