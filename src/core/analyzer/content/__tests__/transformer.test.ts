/**
 * Unit tests for transformer
 */

import { describe, it, expect } from 'vitest';
import { transformTopics, transformReplies } from '../transformer';
import type { V2exTopicDetail, V2exReply } from '@/core/v2ex/types/entities';

describe('transformTopics', () => {
  it('should transform V2exTopicDetail to ContentTopic', () => {
    const topics: V2exTopicDetail[] = [
      {
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
  it('should transform V2exReply to ContentReply', () => {
    const replies: V2exReply[] = [
      {
        topicTitle: 'Reply Topic Title',
        nodeName: 'Q&A',
        content: 'Reply Content',
        replyTime: '1 day ago',
        topicReplyCount: 50,
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
