/**
 * transformer 单元测试
 */

import { describe, it, expect } from 'vitest';
import { transformTopics, transformReplies } from '../transformer';
import type { V2exTopicDetail, V2exReply } from '@/modules/v2ex/types/entities';

describe('transformTopics', () => {
  it('应将 V2exTopicDetail 转换为 ContentTopic', () => {
    const topics: V2exTopicDetail[] = [
      {
        title: '测试标题',
        nodeName: '技术',
        content: '测试内容',
        createdAt: '2024-01-01',
        replyCount: 10,
        clickCount: 100,
        lastReplyTime: '2024-01-02',
      },
    ];

    const result = transformTopics(topics);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: '测试标题',
      nodeName: '技术',
      content: '测试内容',
    });
  });

  it('空数组应返回空数组', () => {
    expect(transformTopics([])).toEqual([]);
  });
});

describe('transformReplies', () => {
  it('应将 V2exReply 转换为 ContentReply', () => {
    const replies: V2exReply[] = [
      {
        topicTitle: '回复的帖子标题',
        nodeName: '问与答',
        content: '回复内容',
        replyTime: '1 天前',
        topicReplyCount: 50,
        isDirectReply: true,
        replyTo: null,
      },
    ];

    const result = transformReplies(replies);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      topicTitle: '回复的帖子标题',
      nodeName: '问与答',
      content: '回复内容',
    });
  });

  it('空数组应返回空数组', () => {
    expect(transformReplies([])).toEqual([]);
  });
});
