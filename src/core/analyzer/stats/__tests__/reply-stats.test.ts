/**
 * reply-stats 单元测试
 */

import { describe, it, expect } from 'vitest';
import { calculateReplyStats } from '../reply-stats';

describe('calculateReplyStats', () => {
  it('should calculate reply statistics', () => {
    const replies = [
      {
        topicId: '100001',
        topicReplyCount: 100,
        topicTitle: 'Topic 1',
        nodeName: 'go',
        occurredAt: new Date(2024, 0, 9),
        content: 'This is a reply',
        isDirectReply: true,
        replyTo: null,
      },
      {
        topicId: '100002',
        topicReplyCount: 50,
        topicTitle: 'Topic 2',
        nodeName: 'go',
        occurredAt: new Date(2024, 0, 8),
        content: 'Another reply here',
        isDirectReply: false,
        replyTo: 'user',
      },
      {
        topicId: '100003',
        topicReplyCount: 25,
        topicTitle: 'Topic 3',
        nodeName: 'python',
        occurredAt: new Date(2024, 0, 7),
        content: 'Short',
        isDirectReply: true,
        replyTo: null,
      },
    ];

    const result = calculateReplyStats({ replies });

    expect(result.replyCount).toBe(3);
    expect(result.directReplyRatio).toBeCloseTo(0.67, 1);
    expect(result.avgRepliedTopicHeat).toBeCloseTo(58.33, 1);
    expect(result.replyNodeDistribution).toEqual({ go: 2, python: 1 });

    // 验证星期分布：
    // Total: 3
    // Jan 9: 周二
    // Jan 8: 周一
    // Jan 7: 周日
    // 分布: 周二 1 (33%), 周一 1 (33%), 周日 1 (33%), 其他 0
    // 排序后应该是满的7天，且有数据的在前（顺序可能因排序稳定性略有不同，但非0在前）
    const dist = result.replyWeekdayDistribution!;
    expect(Object.keys(dist)).toHaveLength(7);
    expect(dist['周二']).toBeCloseTo(0.33, 1);
    expect(dist['周一']).toBeCloseTo(0.33, 1);
    expect(dist['周日']).toBeCloseTo(0.33, 1);
    expect(dist['周三']).toBe(0);
    // 验证排序：非0的值应该在前面
    const values = Object.values(dist);
    expect(values[0]).toBeGreaterThan(0);
    expect(values[1]).toBeGreaterThan(0);
    expect(values[2]).toBeGreaterThan(0);
    expect(values[values.length - 1]).toBe(0);
  });

  it('should handle empty replies', () => {
    const result = calculateReplyStats({ replies: [] });

    expect(result.replyCount).toBe(0);
    expect(result.avgReplyLength).toBe(0);
    expect(result.avgRepliedTopicHeat).toBeNull();
    expect(result.replyWeekdayDistribution).toBeNull();
  });

  it('should exclude replies without topic heat from the average', () => {
    const result = calculateReplyStats({
      replies: [
        {
          topicId: null,
          topicReplyCount: null,
          topicTitle: 'Unknown topic',
          nodeName: 'go',
          occurredAt: new Date(2024, 0, 9),
          content: 'Reply without topic metadata',
          isDirectReply: true,
          replyTo: null,
        },
        {
          topicId: '100001',
          topicReplyCount: 100,
          topicTitle: 'Known topic',
          nodeName: 'go',
          occurredAt: new Date(2024, 0, 8),
          content: 'Reply with topic metadata',
          isDirectReply: true,
          replyTo: null,
        },
      ],
    });

    expect(result.replyCount).toBe(2);
    expect(result.avgRepliedTopicHeat).toBe(100);
  });

  it('should return null when no reply contains topic heat metadata', () => {
    const result = calculateReplyStats({
      replies: [
        {
          topicId: null,
          topicReplyCount: null,
          topicTitle: 'Unknown topic',
          nodeName: 'go',
          occurredAt: null,
          content: 'Reply without topic metadata',
          isDirectReply: true,
          replyTo: null,
        },
      ],
    });

    expect(result.avgRepliedTopicHeat).toBeNull();
  });

  it('should preserve a measured topic heat of zero', () => {
    const result = calculateReplyStats({
      replies: [
        {
          topicId: '100001',
          topicReplyCount: 0,
          topicTitle: 'Topic without replies',
          nodeName: 'go',
          occurredAt: null,
          content: 'Reply',
          isDirectReply: true,
          replyTo: null,
        },
      ],
    });

    expect(result.avgRepliedTopicHeat).toBe(0);
  });
});
