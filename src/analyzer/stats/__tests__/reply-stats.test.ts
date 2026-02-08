/**
 * reply-stats 单元测试
 */

import { describe, it, expect } from 'vitest';
import { calculateReplyStats } from '../reply-stats';

describe('calculateReplyStats', () => {
  it('should calculate reply statistics', () => {
    const replies = [
      {
        topicTitle: 'Topic 1',
        topicReplyCount: 100,
        nodeName: 'go',
        replyTime: '1 天前',
        content: 'This is a reply',
        isDirectReply: true,
        replyTo: null,
      },
      {
        topicTitle: 'Topic 2',
        topicReplyCount: 50,
        nodeName: 'go',
        replyTime: '2 天前',
        content: 'Another reply here',
        isDirectReply: false,
        replyTo: 'user',
      },
      {
        topicTitle: 'Topic 3',
        topicReplyCount: 25,
        nodeName: 'python',
        replyTime: '3 天前',
        content: 'Short',
        isDirectReply: true,
        replyTo: null,
      },
    ];

    const result = calculateReplyStats({
      replies,
      referenceDate: new Date(2024, 0, 10),
    });

    expect(result.replyCount).toBe(3);
    expect(result.directReplyRatio).toBeCloseTo(0.67, 1);
    expect(result.avgRepliedTopicHeat).toBeCloseTo(58.33, 1);
    expect(result.replyNodeDistribution).toEqual({ go: 2, python: 1 });
  });

  it('should handle empty replies', () => {
    const result = calculateReplyStats({ replies: [] });

    expect(result.replyCount).toBe(0);
    expect(result.avgReplyLength).toBe(0);
    expect(result.replyWeekdayDistribution).toBeNull();
  });
});
