/**
 * topic-stats 单元测试
 */

import { describe, it, expect } from 'vitest';
import { calculateTopicStats } from '../topic-stats';

describe('calculateTopicStats', () => {
  it('should calculate topic statistics', () => {
    const topics = [
      {
        topicId: '200001',
        sourceUrl: 'https://www.v2ex.com/t/200001',
        title: 'Topic 1',
        nodeName: 'go',
        createdAt: '2024-01-01 10:00:00 +08:00',
        content: 'content',
        replyCount: 10,
        lastReplyTime: '2024-01-02 10:00:00 +08:00',
        clickCount: 100,
      },
      {
        topicId: '200002',
        sourceUrl: 'https://www.v2ex.com/t/200002',
        title: 'Topic 2',
        nodeName: 'go',
        createdAt: '2024-01-02 14:00:00 +08:00',
        content: 'content',
        replyCount: 20,
        lastReplyTime: null,
        clickCount: 200,
      },
      {
        topicId: '200003',
        sourceUrl: 'https://www.v2ex.com/t/200003',
        title: 'Topic 3',
        nodeName: 'python',
        createdAt: '2024-01-03 10:00:00 +08:00',
        content: 'content',
        replyCount: 5,
        lastReplyTime: null,
        clickCount: 50,
      },
    ];

    const result = calculateTopicStats({
      topics,
      startDate: new Date(2024, 0, 1),
      endDate: new Date(2024, 0, 3),
    });

    expect(result.topicCount).toBe(3);
    expect(result.avgTopicReplyCount).toBeCloseTo(11.67, 1);
    expect(result.avgTopicClickCount).toBeCloseTo(116.67, 1);
    expect(result.topicNodeDistribution).toEqual({ go: 2, python: 1 });
    expect(result.timeRange).toBe('2024-01-01 to 2024-01-03');
  });

  it('should handle empty topics', () => {
    const result = calculateTopicStats({
      topics: [],
      startDate: new Date(2024, 0, 1),
      endDate: new Date(2024, 0, 1),
    });

    expect(result.topicCount).toBe(0);
    expect(result.avgTopicReplyCount).toBe(0);
  });
});
