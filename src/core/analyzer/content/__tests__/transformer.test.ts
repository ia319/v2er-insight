/**
 * Unit tests for transformer
 */

import { describe, it, expect } from 'vitest';
import { transformTopics, transformReplies } from '../transformer';
import type { AnalyzerReply } from '../../types';
import type { V2exTopicDetail } from '@/core/v2ex/types/entities';

describe('transformTopics', () => {
  it('should transform V2exTopicDetail to ContentTopic', () => {
    const topics: V2exTopicDetail[] = [
      {
        topicId: '200001',
        sourceUrl: 'https://www.v2ex.com/t/200001',
        title: 'Test Title',
        nodeName: 'Technology',
        content: 'Test Content',
        createdAt: '2024-01-01',
        replyCount: 10,
        clickCount: 100,
        lastReplyTime: '2024-01-02',
      },
    ];

    const result = transformTopics(topics);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: 'Test Title',
      nodeName: 'Technology',
      content: 'Test Content',
    });
  });

  it('should return empty array for empty input', () => {
    expect(transformTopics([])).toEqual([]);
  });
});

describe('transformReplies', () => {
  it('should transform AnalyzerReply to ContentReply', () => {
    const replies: AnalyzerReply[] = [
      {
        replyId: '100001#reply50',
        topicId: '100001',
        replyNumber: 50,
        topicTitle: 'Reply Topic Title',
        nodeName: 'Q&A',
        content: 'Reply Content',
        occurredAt: new Date(2024, 0, 1),
        isDirectReply: true,
        replyTo: null,
      },
    ];

    const result = transformReplies(replies);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      topicTitle: 'Reply Topic Title',
      nodeName: 'Q&A',
      content: 'Reply Content',
    });
  });

  it('should return empty array for empty input', () => {
    expect(transformReplies([])).toEqual([]);
  });
});
