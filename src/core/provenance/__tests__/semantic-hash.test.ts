import { describe, expect, it } from 'vitest';

import type { RawSnapshotV2 } from '@/core/snapshot';
import { computeSemanticDataHash } from '../semantic-hash';

function createSnapshot(): RawSnapshotV2 {
  return {
    schemaVersion: 2,
    username: 'alice',
    capturedAt: '2026-07-12T03:04:05.000Z',
    profile: {
      joinDate: '2020-01-02 03:04:05 +08:00',
      dailyRanking: 42,
    },
    topics: {
      status: 'complete',
      totalExpected: 2,
      fetchedCount: 2,
      failedCount: 0,
      failedPageCount: 0,
      identityFailureCount: 0,
      duplicateConflictCount: 0,
      hidden: false,
      items: [
        {
          topicId: '10',
          sourceUrl: 'https://www.v2ex.com/t/10',
          title: 'Second topic',
          nodeName: 'create',
          createdAt: '2026-07-02 10:00:00 +08:00',
          content: 'Second topic content',
          replyCount: 2,
          lastReplyAt: '2026-07-03 10:00:00 +08:00',
          clickCount: 20,
        },
        {
          topicId: '2',
          sourceUrl: 'https://www.v2ex.com/t/2',
          title: 'First topic',
          nodeName: 'programmer',
          createdAt: '2026-07-01 10:00:00 +08:00',
          content: 'First topic content',
          replyCount: 1,
          lastReplyAt: null,
          clickCount: 10,
        },
      ],
    },
    replies: {
      status: 'complete',
      totalExpected: 2,
      fetchedCount: 2,
      failedCount: 0,
      failedPageCount: 0,
      identityFailureCount: 0,
      duplicateConflictCount: 0,
      items: [
        {
          replyId: '10#reply2',
          topicId: '10',
          replyNumber: 2,
          topicTitle: 'Second topic',
          nodeName: 'create',
          displayReplyTime: '3 小时前',
          occurredAt: '2026-07-12T00:04:05.000Z',
          timePrecision: 'hour',
          content: 'Second reply',
          isDirectReply: false,
          replyTo: 'bob',
        },
        {
          replyId: '2#reply1',
          topicId: '2',
          replyNumber: 1,
          topicTitle: 'First topic',
          nodeName: 'programmer',
          displayReplyTime: '1 天前',
          occurredAt: '2026-07-11T03:04:05.000Z',
          timePrecision: 'day',
          content: 'First reply',
          isDirectReply: true,
          replyTo: null,
        },
      ],
    },
  };
}

describe('computeSemanticDataHash', () => {
  it('returns a SHA-256 hex digest', () => {
    expect(computeSemanticDataHash(createSnapshot())).toMatch(/^[a-f0-9]{64}$/);
  });

  it('ignores capture metadata, ranking, item order, and reply time drift', () => {
    const snapshot = createSnapshot();
    const reordered: RawSnapshotV2 = {
      ...snapshot,
      capturedAt: '2026-07-13T03:04:05.000Z',
      profile: { ...snapshot.profile, dailyRanking: 1 },
      topics: { ...snapshot.topics, items: [...snapshot.topics.items].reverse() },
      replies: {
        ...snapshot.replies,
        items: [...snapshot.replies.items].reverse().map((reply) => ({
          ...reply,
          displayReplyTime: 'different display time',
          occurredAt: '2026-07-10T00:00:00.000Z',
          timePrecision: 'minute',
        })),
      },
    };

    expect(computeSemanticDataHash(reordered)).toBe(computeSemanticDataHash(snapshot));
  });

  it.each([
    ['topic content', (snapshot: RawSnapshotV2) => (snapshot.topics.items[0]!.content = 'edited')],
    ['topic clicks', (snapshot: RawSnapshotV2) => snapshot.topics.items[0]!.clickCount++],
    ['reply content', (snapshot: RawSnapshotV2) => (snapshot.replies.items[0]!.content = 'edited')],
    ['visibility', (snapshot: RawSnapshotV2) => (snapshot.topics.hidden = true)],
    ['completeness', (snapshot: RawSnapshotV2) => (snapshot.replies.status = 'partial')],
    ['duplicate conflicts', (snapshot: RawSnapshotV2) => snapshot.replies.duplicateConflictCount++],
  ])('changes when %s changes', (_, mutate) => {
    const baseline = createSnapshot();
    const changed = createSnapshot();
    mutate(changed);

    expect(computeSemanticDataHash(changed)).not.toBe(computeSemanticDataHash(baseline));
  });
});
