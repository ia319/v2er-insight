/**
 * splitter 单元测试
 */

import { describe, it, expect } from 'vitest';
import { splitByPeriods } from '../splitter';
import type { PeriodBoundary } from '../../types';

describe('splitByPeriods', () => {
  const boundaries: PeriodBoundary[] = [
    { startDate: new Date(2024, 0, 1), endDate: new Date(2024, 0, 31) },
    { startDate: new Date(2024, 3, 1), endDate: new Date(2024, 3, 30) },
  ];

  it('should assign topics to correct periods', () => {
    const topics = [
      {
        title: 'Jan Topic',
        nodeName: 'test',
        createdAt: '2024-01-15 10:00:00 +08:00',
        content: '',
        replyCount: 0,
        lastReplyTime: null,
        clickCount: 0,
      },
      {
        title: 'Apr Topic',
        nodeName: 'test',
        createdAt: '2024-04-15 10:00:00 +08:00',
        content: '',
        replyCount: 0,
        lastReplyTime: null,
        clickCount: 0,
      },
    ];

    const result = splitByPeriods(boundaries, topics, []);

    expect(result).toHaveLength(2);
    expect(result[0]?.topics).toHaveLength(1);
    expect(result[0]?.topics[0]?.title).toBe('Jan Topic');
    expect(result[1]?.topics).toHaveLength(1);
    expect(result[1]?.topics[0]?.title).toBe('Apr Topic');
  });

  it('should assign replies to correct periods', () => {
    const replies = [
      {
        topicTitle: 'Topic',
        topicReplyCount: 10,
        nodeName: 'test',
        replyTime: '5 天前',
        content: 'reply',
        isDirectReply: true,
        replyTo: null,
      },
    ];

    // referenceDate 设为 2024-01-10，5天前是 2024-01-05
    const result = splitByPeriods(boundaries, [], replies, new Date(2024, 0, 10));

    expect(result[0]?.replies).toHaveLength(1);
    expect(result[1]?.replies).toHaveLength(0);
  });

  it('should return empty periods for no content', () => {
    const result = splitByPeriods(boundaries, [], []);

    expect(result).toHaveLength(2);
    expect(result[0]?.topics).toHaveLength(0);
    expect(result[0]?.replies).toHaveLength(0);
  });

  it('should exclude topics outside all period boundaries', () => {
    const topics = [
      {
        title: 'Outside Topic',
        nodeName: 'test',
        createdAt: '2024-02-15 10:00:00 +08:00', // 在两个周期之间
        content: '',
        replyCount: 0,
        lastReplyTime: null,
        clickCount: 0,
      },
    ];

    const result = splitByPeriods(boundaries, topics, []);

    // 不属于任何周期的数据被排除
    expect(result[0]?.topics).toHaveLength(0);
    expect(result[1]?.topics).toHaveLength(0);
  });

  it('should include topics exactly on boundary dates', () => {
    const topics = [
      {
        title: 'Boundary Start',
        nodeName: 'test',
        createdAt: '2024-01-01 10:00:00 +08:00', // 边界起点当天
        content: '',
        replyCount: 0,
        lastReplyTime: null,
        clickCount: 0,
      },
      {
        title: 'Boundary End',
        nodeName: 'test',
        createdAt: '2024-01-31 10:00:00 +08:00', // 边界终点当天
        content: '',
        replyCount: 0,
        lastReplyTime: null,
        clickCount: 0,
      },
    ];

    // 使用包含完整当天的边界
    const fullDayBoundaries = [
      {
        startDate: new Date(2024, 0, 1, 0, 0, 0),
        endDate: new Date(2024, 0, 31, 23, 59, 59),
      },
    ];

    const result = splitByPeriods(fullDayBoundaries, topics, []);

    expect(result[0]?.topics).toHaveLength(2);
  });
});
