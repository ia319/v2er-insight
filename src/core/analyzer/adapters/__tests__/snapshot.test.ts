import { describe, expect, it } from 'vitest';

import type { RawSnapshotV2 } from '@/core/snapshot';
import { buildAnalyzerOutputFromSnapshot } from '../../builder';
import { createAnalyzerInput } from '../snapshot';

const snapshot: RawSnapshotV2 = {
  schemaVersion: 2,
  username: 'alice',
  capturedAt: '2026-07-12T03:04:05.000Z',
  profile: {
    joinDate: '2020-01-02 03:04:05 +08:00',
    dailyRanking: 42,
  },
  topics: {
    status: 'complete',
    totalExpected: 1,
    fetchedCount: 1,
    failedCount: 0,
    failedPageCount: 0,
    identityFailureCount: 0,
    hidden: false,
    items: [
      {
        topicId: '100',
        sourceUrl: 'https://www.v2ex.com/t/100',
        title: 'Topic title',
        nodeName: 'create',
        createdAt: '2026-07-01 10:00:00 +08:00',
        content: 'Topic content',
        replyCount: 3,
        lastReplyAt: '2026-07-02 10:00:00 +08:00',
        clickCount: 20,
      },
    ],
  },
  replies: {
    status: 'complete',
    totalExpected: 1,
    fetchedCount: 1,
    failedCount: 0,
    failedPageCount: 0,
    identityFailureCount: 0,
    items: [
      {
        replyId: '100#reply2',
        topicId: '100',
        replyNumber: 2,
        topicTitle: 'Topic title',
        nodeName: 'create',
        displayReplyTime: '3 小时前',
        occurredAt: null,
        timePrecision: 'unknown',
        content: 'Reply content',
        isDirectReply: false,
        replyTo: 'bob',
      },
    ],
  },
};

describe('createAnalyzerInput', () => {
  it('maps snapshot records without losing stable identities', () => {
    expect(createAnalyzerInput(snapshot)).toEqual({
      profile: snapshot.profile,
      topics: [
        {
          topicId: '100',
          sourceUrl: 'https://www.v2ex.com/t/100',
          title: 'Topic title',
          nodeName: 'create',
          createdAt: '2026-07-01 10:00:00 +08:00',
          content: 'Topic content',
          replyCount: 3,
          lastReplyTime: '2026-07-02 10:00:00 +08:00',
          clickCount: 20,
        },
      ],
      replies: [
        {
          replyId: '100#reply2',
          topicId: '100',
          replyNumber: 2,
          topicTitle: 'Topic title',
          nodeName: 'create',
          replyTime: '3 小时前',
          content: 'Reply content',
          isDirectReply: false,
          replyTo: 'bob',
        },
      ],
      topicsStatus: 'complete',
      repliesStatus: 'complete',
      isTopicsHidden: false,
    });
  });

  it('uses capturedAt as the relative reply time reference', () => {
    expect(buildAnalyzerOutputFromSnapshot(snapshot).userOverview.lastActiveTime).toBe(
      '2026-07-12T00:04:05.000Z',
    );
  });
});
