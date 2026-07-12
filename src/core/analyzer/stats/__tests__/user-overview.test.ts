/**
 * user-overview 单元测试
 */

import { describe, it, expect } from 'vitest';
import { calculateUserOverview } from '../user-overview';
import type { RawUserData } from '../../types';

const mockProfile = {
  joinDate: '2020-01-01 10:00:00 +08:00',
  dailyRanking: 100,
};

describe('calculateUserOverview', () => {
  it('should calculate basic overview', () => {
    const data: RawUserData = {
      profile: mockProfile,
      topics: [
        {
          topicId: '200001',
          sourceUrl: 'https://www.v2ex.com/t/200001',
          title: 'Test',
          nodeName: 'test',
          createdAt: '2024-01-01 10:00:00 +08:00',
          content: 'content',
          replyCount: 10,
          lastReplyTime: null,
          clickCount: 100,
        },
      ],
      replies: [
        {
          replyId: '100001#reply50',
          topicId: '100001',
          replyNumber: 50,
          topicTitle: 'Topic',
          nodeName: 'node',
          replyTime: '1 天前',
          content: 'reply',
          isDirectReply: true,
          replyTo: null,
        },
        {
          replyId: '100002#reply30',
          topicId: '100002',
          replyNumber: 30,
          topicTitle: 'Topic2',
          nodeName: 'node2',
          replyTime: '2 天前',
          content: 'reply2',
          isDirectReply: false,
          replyTo: 'user',
        },
      ],
      isTopicsHidden: false,
    };

    const result = calculateUserOverview(data);

    expect(result.joinDate).toBe('2020-01-01 10:00:00 +08:00');
    expect(result.totalTopics).toBe(1);
    expect(result.totalReplies).toBe(2);
    expect(result.topicReplyRatio).toBe(0.5);
    expect(result.isTopicsHidden).toBe(false);
    expect(result.dailyRanking).toBe(100);
  });

  it('should handle empty data', () => {
    const data: RawUserData = {
      profile: { joinDate: '2020-01-01', dailyRanking: null },
      topics: [],
      replies: [],
      isTopicsHidden: true,
    };

    const result = calculateUserOverview(data);

    expect(result.totalTopics).toBeNull();
    expect(result.totalReplies).toBe(0);
    expect(result.topicReplyRatio).toBeNull();
    expect(result.lastActiveTime).toBe('unknown');
  });
});
