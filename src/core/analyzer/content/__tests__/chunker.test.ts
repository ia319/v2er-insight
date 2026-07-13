/**
 * Unit tests for chunker
 */

import { describe, it, expect } from 'vitest';
import { chunkPeriodContent } from '../chunker';
import type { ActivePeriod, AnalyzerReply } from '../../types';
import type { V2exTopicDetail } from '@/core/v2ex/types/entities';

// Create topics for testing
function createTopic(index: number): V2exTopicDetail {
  return {
    topicId: String(200000 + index),
    sourceUrl: `https://www.v2ex.com/t/${200000 + index}`,
    title: `Topic ${index}`,
    nodeName: 'Technology',
    content: `Content ${index}`,
    createdAt: '2024-01-01',
    replyCount: 10,
    clickCount: 100,
    lastReplyTime: '2024-01-02',
  };
}

// Create replies for testing
function createReply(index: number): AnalyzerReply {
  return {
    replyId: `100001#reply${index}`,
    topicId: '100001',
    replyNumber: index,
    topicTitle: `Reply Topic ${index}`,
    nodeName: 'Q&A',
    content: `Reply Content ${index}`,
    occurredAt: new Date(2024, 0, 1),
    isDirectReply: true,
    replyTo: null,
  };
}

describe('chunkPeriodContent', () => {
  it('should return PeriodContent when content is below threshold', () => {
    const period: ActivePeriod = {
      index: 0,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-06-01'),
      topics: [createTopic(1), createTopic(2)],
      replies: [createReply(1), createReply(2)],
    };

    const result = chunkPeriodContent(period);

    // Should be PeriodContent (no chunkIndex)
    expect(result).not.toBeInstanceOf(Array);
    expect(result).toHaveProperty('periodIndex', 0);
    expect(result).toHaveProperty('topics');
    expect(result).toHaveProperty('replies');
    expect(result).not.toHaveProperty('chunkIndex');
  });

  it('should return chunk array when topics exceed threshold', () => {
    // Create 25 topics (exceeds CHUNK_MAX_TOPICS=20)
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

  it('should return chunk array when replies exceed threshold', () => {
    // Create 150 replies (exceeds CHUNK_MAX_REPLIES=100)
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

  it('chunk should contain correct periodIndex', () => {
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
