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
    expect(result.replyWeekdayDistribution).toBeNull();
  });
});
