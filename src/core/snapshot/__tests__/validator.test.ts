import { describe, expect, it } from 'vitest';

import { buildRawSnapshot } from '../builder';
import { isRawSnapshotV2 } from '../validator';

function createSnapshot() {
  return buildRawSnapshot({
    username: 'alice',
    capturedAt: new Date('2026-07-12T03:04:05.000Z'),
    profile: {
      joinDate: '2020-01-02 03:04:05 +08:00',
      dailyRanking: 42,
    },
    topics: {
      requested: true,
      result: {
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
        totalTopics: 1,
        fetchedTopics: 1,
        failedTopics: 0,
        failedPages: 0,
        invalidTopicCount: 0,
        isHidden: false,
      },
    },
    replies: {
      requested: true,
      result: {
        data: [
          {
            topicId: '100',
            topicReplyCount: 2,
            topicTitle: 'Topic title',
            nodeName: 'create',
            replyTime: '3 小时前',
            content: 'Reply content',
            isDirectReply: true,
            replyTo: null,
          },
        ],
        totalPages: 1,
        fetchedPages: 1,
        failedPages: 0,
        totalReplies: 1,
        invalidReplyCount: 0,
      },
    },
  });
}

describe('isRawSnapshotV2', () => {
  it('accepts snapshots produced by the builder', () => {
    expect(isRawSnapshotV2(createSnapshot())).toBe(true);
  });

  it('rejects legacy raw data without a schema version', () => {
    expect(
      isRawSnapshotV2({
        profile: {},
        topics: [],
        replies: [],
        isTopicsHidden: false,
      }),
    ).toBe(false);
  });

  it('rejects invalid capturedAt values', () => {
    const snapshot = createSnapshot();

    expect(isRawSnapshotV2({ ...snapshot, capturedAt: 'not-a-date' })).toBe(false);
  });

  it('rejects collection counts that disagree with the item list', () => {
    const snapshot = createSnapshot();

    expect(
      isRawSnapshotV2({
        ...snapshot,
        topics: { ...snapshot.topics, fetchedCount: 2 },
      }),
    ).toBe(false);
  });

  it('rejects invalid reply topic metadata', () => {
    const snapshot = createSnapshot();
    const reply = snapshot.replies.items[0];

    if (!reply) {
      throw new Error('Expected reply fixture');
    }

    expect(
      isRawSnapshotV2({
        ...snapshot,
        replies: {
          ...snapshot.replies,
          items: [{ ...reply, topicId: 'invalid' }],
        },
      }),
    ).toBe(false);

    expect(
      isRawSnapshotV2({
        ...snapshot,
        replies: {
          ...snapshot.replies,
          items: [{ ...reply, topicReplyCount: -1 }],
        },
      }),
    ).toBe(false);
  });

  it('accepts nullable reply topic metadata when incompleteness is reported', () => {
    const snapshot = createSnapshot();
    const reply = snapshot.replies.items[0];

    if (!reply) {
      throw new Error('Expected reply fixture');
    }

    const items = [{ ...reply, topicId: null, topicReplyCount: null }];

    expect(isRawSnapshotV2({ ...snapshot, replies: { ...snapshot.replies, items } })).toBe(false);
    expect(
      isRawSnapshotV2({
        ...snapshot,
        replies: {
          ...snapshot.replies,
          status: 'partial',
          failedCount: 1,
          identityFailureCount: 1,
          items,
        },
      }),
    ).toBe(true);
  });

  it('rejects reply time precision without a normalized occurrence', () => {
    const snapshot = createSnapshot();
    const reply = snapshot.replies.items[0];

    if (!reply) {
      throw new Error('Expected reply fixture');
    }

    expect(
      isRawSnapshotV2({
        ...snapshot,
        replies: {
          ...snapshot.replies,
          items: [{ ...reply, occurredAt: null, timePrecision: 'hour' }],
        },
      }),
    ).toBe(false);
  });

  it('rejects duplicate stable identities', () => {
    const snapshot = createSnapshot();
    const topic = snapshot.topics.items[0];

    if (!topic) {
      throw new Error('Expected topic fixture');
    }

    expect(
      isRawSnapshotV2({
        ...snapshot,
        topics: {
          ...snapshot.topics,
          fetchedCount: 2,
          totalExpected: 2,
          items: [topic, topic],
        },
      }),
    ).toBe(false);
  });

  it('rejects noncanonical topic identities', () => {
    const snapshot = createSnapshot();
    const topic = snapshot.topics.items[0];

    if (!topic) {
      throw new Error('Expected topic fixture');
    }

    expect(
      isRawSnapshotV2({
        ...snapshot,
        topics: {
          ...snapshot.topics,
          items: [{ ...topic, sourceUrl: 'https://www.v2ex.com/t/999' }],
        },
      }),
    ).toBe(false);
  });

  it('rejects partial collections without an incomplete-data reason', () => {
    const snapshot = createSnapshot();

    expect(
      isRawSnapshotV2({
        ...snapshot,
        replies: { ...snapshot.replies, status: 'partial' },
      }),
    ).toBe(false);
  });

  it('accepts a topic duplicate conflict as a partial collection reason', () => {
    const snapshot = createSnapshot();

    expect(
      isRawSnapshotV2({
        ...snapshot,
        topics: {
          ...snapshot.topics,
          status: 'partial',
          duplicateConflictCount: 1,
        },
      }),
    ).toBe(true);
  });

  it('rejects reply duplicate conflict diagnostics', () => {
    const snapshot = createSnapshot();

    expect(
      isRawSnapshotV2({
        ...snapshot,
        replies: {
          ...snapshot.replies,
          status: 'partial',
          duplicateConflictCount: 1,
        },
      }),
    ).toBe(false);
  });
});
