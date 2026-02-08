/**
 * chunker 单元测试
 */

import { describe, it, expect } from 'vitest';
import { chunkPeriodContent } from '../chunker';
import type { ActivePeriod } from '../../types';
import type { V2exTopicDetail, V2exReply } from '@/core/v2ex/types/entities';

// 创建测试用的帖子
function createTopic(index: number): V2exTopicDetail {
  return {
    title: `帖子 ${index}`,
    nodeName: '技术',
    content: `内容 ${index}`,
    createdAt: '2024-01-01',
    replyCount: 10,
    clickCount: 100,
    lastReplyTime: '2024-01-02',
  };
}

// 创建测试用的回复
function createReply(index: number): V2exReply {
  return {
    topicTitle: `回复帖子 ${index}`,
    nodeName: '问与答',
    content: `回复内容 ${index}`,
    replyTime: '1 天前',
    topicReplyCount: 50,
    isDirectReply: true,
    replyTo: null,
  };
}

describe('chunkPeriodContent', () => {
  it('内容量小于阈值时返回 PeriodContent', () => {
    const period: ActivePeriod = {
      index: 0,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-06-01'),
      topics: [createTopic(1), createTopic(2)],
      replies: [createReply(1), createReply(2)],
    };

    const result = chunkPeriodContent(period);

    // 应该是 PeriodContent（没有 chunkIndex）
    expect(result).not.toBeInstanceOf(Array);
    expect(result).toHaveProperty('periodIndex', 0);
    expect(result).toHaveProperty('topics');
    expect(result).toHaveProperty('replies');
    expect(result).not.toHaveProperty('chunkIndex');
  });

  it('帖子超过阈值时返回分片数组', () => {
    // 创建 25 个帖子（超过 CHUNK_MAX_TOPICS=20）
    const topics = Array.from({ length: 25 }, (_, i) => createTopic(i));

    const period: ActivePeriod = {
      index: 1,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-06-01'),
      topics,
      replies: [],
    };

    const result = chunkPeriodContent(period);

    // 应该是分片数组
    expect(Array.isArray(result)).toBe(true);
    const chunks = result as Array<{ chunkIndex: number; totalChunksInPeriod: number }>;
    expect(chunks.length).toBe(2);
    expect(chunks[0]?.chunkIndex).toBe(0);
    expect(chunks[0]?.totalChunksInPeriod).toBe(2);
    expect(chunks[1]?.chunkIndex).toBe(1);
  });

  it('回复超过阈值时返回分片数组', () => {
    // 创建 150 个回复（超过 CHUNK_MAX_REPLIES=100）
    const replies = Array.from({ length: 150 }, (_, i) => createReply(i));

    const period: ActivePeriod = {
      index: 2,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-06-01'),
      topics: [],
      replies,
    };

    const result = chunkPeriodContent(period);

    // 应该是分片数组
    expect(Array.isArray(result)).toBe(true);
    const chunks = result as Array<{ chunkIndex: number; totalChunksInPeriod: number }>;
    expect(chunks.length).toBe(2);
  });

  it('分片应包含正确的 periodIndex', () => {
    const topics = Array.from({ length: 25 }, (_, i) => createTopic(i));

    const period: ActivePeriod = {
      index: 5,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-06-01'),
      topics,
      replies: [],
    };

    const result = chunkPeriodContent(period);

    expect(Array.isArray(result)).toBe(true);
    const chunks = result as Array<{ periodIndex: number }>;
    chunks.forEach((chunk) => {
      expect(chunk.periodIndex).toBe(5);
    });
  });
});
