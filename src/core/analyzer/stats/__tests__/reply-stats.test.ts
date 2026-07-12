/**
 * reply-stats 单元测试
 */

import { describe, it, expect } from 'vitest';
import { calculateReplyStats } from '../reply-stats';

describe('calculateReplyStats', () => {
  it('should calculate reply statistics', () => {
    const replies = [
      {
        replyId: '100001#reply100',
        topicId: '100001',
        replyNumber: 100,
        topicTitle: 'Topic 1',
        nodeName: 'go',
        replyTime: '1 天前',
        content: 'This is a reply',
        isDirectReply: true,
        replyTo: null,
      },
      {
        replyId: '100002#reply50',
        topicId: '100002',
        replyNumber: 50,
        topicTitle: 'Topic 2',
        nodeName: 'go',
        replyTime: '2 天前',
        content: 'Another reply here',
        isDirectReply: false,
        replyTo: 'user',
      },
      {
        replyId: '100003#reply25',
        topicId: '100003',
        replyNumber: 25,
        topicTitle: 'Topic 3',
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
    expect(result.avgReplyPosition).toBeCloseTo(58.33, 1);
    expect(result.replyNodeDistribution).toEqual({ go: 2, python: 1 });

    // 验证星期分布：
    // Total: 3
    // 2024-01-10 是周三
    // 1天前 (Jan 9): 周二
    // 2天前 (Jan 8): 周一
    // 3天前 (Jan 7): 周日
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
    expect(result.avgReplyPosition).toBe(0);
    expect(result.replyWeekdayDistribution).toBeNull();
  });

  it('should exclude replies without stable positions from the average', () => {
    const result = calculateReplyStats({
      replies: [
        {
          replyId: null,
          topicId: null,
          replyNumber: null,
          topicTitle: 'Unknown topic',
          nodeName: 'go',
          replyTime: '1 天前',
          content: 'Reply without a stable anchor',
          isDirectReply: true,
          replyTo: null,
        },
      ],
    });

    expect(result.avgReplyPosition).toBe(0);
  });
});
