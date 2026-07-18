import { describe, expect, it } from 'vitest';

import type {
  UserProfileParseResult,
  UserRepliesResult,
  UserTopicsDetailResult,
  V2exReply,
  V2exTopicDetail,
} from '@/core/v2ex';
import { buildRawSnapshot } from '../builder';
import { isRawSnapshotV2 } from '../validator';

const profile: UserProfileParseResult = {
  joinDate: '2020-01-02 03:04:05 +08:00',
  dailyRanking: 42,
};

function createTopic(overrides: Partial<V2exTopicDetail> = {}): V2exTopicDetail {
  return {
    topicId: '100',
    sourceUrl: 'https://www.v2ex.com/t/100',
    title: 'Topic title',
    nodeName: 'create',
    createdAt: '2026-07-01 10:00:00 +08:00',
    content: 'Topic content',
    replyCount: 3,
    lastReplyTime: '2026-07-02 10:00:00 +08:00',
    clickCount: 20,
    ...overrides,
  };
}

function createReply(overrides: Partial<V2exReply> = {}): V2exReply {
  return {
    topicId: '100',
    topicReplyCount: 2,
    topicTitle: 'Topic title',
    nodeName: 'create',
    replyTime: '3 小时前',
    content: 'Reply content',
    isDirectReply: true,
    replyTo: null,
    ...overrides,
  };
}

function createTopicsResult(
  overrides: Partial<UserTopicsDetailResult> = {},
): UserTopicsDetailResult {
  return {
    topics: [createTopic()],
    totalTopics: 1,
    fetchedTopics: 1,
    failedTopics: 0,
    failedPages: 0,
    invalidTopicCount: 0,
    isHidden: false,
    ...overrides,
  };
}

function createRepliesResult(overrides: Partial<UserRepliesResult> = {}): UserRepliesResult {
  return {
    data: [createReply()],
    totalPages: 1,
    fetchedPages: 1,
    failedPages: 0,
    totalReplies: 1,
    invalidReplyCount: 0,
    ...overrides,
  };
}

function buildSnapshot(
  topics: UserTopicsDetailResult = createTopicsResult(),
  replies: UserRepliesResult = createRepliesResult(),
) {
  return buildRawSnapshot({
    username: 'alice',
    capturedAt: new Date('2026-07-12T03:04:05.000Z'),
    profile,
    topics: { requested: true, result: topics },
    replies: { requested: true, result: replies },
  });
}

describe('buildRawSnapshot', () => {
  it('builds a complete snapshot with topic metadata for replies', () => {
    const snapshot = buildSnapshot();

    expect(snapshot).toEqual({
      schemaVersion: 2,
      username: 'alice',
      capturedAt: '2026-07-12T03:04:05.000Z',
      profile,
      topics: {
        status: 'complete',
        totalExpected: 1,
        fetchedCount: 1,
        failedCount: 0,
        failedPageCount: 0,
        identityFailureCount: 0,
        duplicateConflictCount: 0,
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
        duplicateConflictCount: 0,
        items: [
          {
            topicId: '100',
            topicReplyCount: 2,
            topicTitle: 'Topic title',
            nodeName: 'create',
            displayReplyTime: '3 小时前',
            occurredAt: '2026-07-12T00:04:05.000Z',
            timePrecision: 'hour',
            content: 'Reply content',
            isDirectReply: true,
            replyTo: null,
          },
        ],
      },
    });
  });

  it('distinguishes unrequested collections from confirmed empty collections', () => {
    const snapshot = buildRawSnapshot({
      username: 'alice',
      capturedAt: new Date('2026-07-12T03:04:05.000Z'),
      profile,
      topics: { requested: false },
      replies: {
        requested: true,
        result: createRepliesResult({ data: [], totalReplies: 0 }),
      },
    });

    expect(snapshot.topics).toMatchObject({
      status: 'not_requested',
      totalExpected: null,
      fetchedCount: 0,
      items: [],
    });
    expect(snapshot.replies).toMatchObject({
      status: 'complete',
      totalExpected: 0,
      fetchedCount: 0,
      items: [],
    });
  });

  it('marks both collection scopes as not requested independently', () => {
    const snapshot = buildRawSnapshot({
      username: 'alice',
      capturedAt: new Date('2026-07-12T03:04:05.000Z'),
      profile,
      topics: { requested: false },
      replies: { requested: false },
    });

    expect(snapshot.topics).toMatchObject({
      status: 'not_requested',
      totalExpected: null,
      hidden: false,
      items: [],
    });
    expect(snapshot.replies).toMatchObject({
      status: 'not_requested',
      totalExpected: null,
      items: [],
    });
  });

  it('preserves explicit hidden and visible empty topic states', () => {
    const hidden = buildSnapshot(
      createTopicsResult({ topics: [], totalTopics: 0, fetchedTopics: 0, isHidden: true }),
    );
    const visibleEmpty = buildSnapshot(
      createTopicsResult({ topics: [], totalTopics: 0, fetchedTopics: 0 }),
    );

    expect(hidden.topics).toMatchObject({ status: 'complete', hidden: true, items: [] });
    expect(visibleEmpty.topics).toMatchObject({
      status: 'complete',
      hidden: false,
      items: [],
    });
  });

  it('marks topic collection partial when list pages fail', () => {
    const snapshot = buildSnapshot(createTopicsResult({ failedPages: 1 }));

    expect(snapshot.topics).toMatchObject({
      status: 'partial',
      totalExpected: null,
      failedPageCount: 1,
    });
  });

  it('preserves topic item and identity failure diagnostics', () => {
    const snapshot = buildSnapshot(
      createTopicsResult({
        totalTopics: 3,
        fetchedTopics: 1,
        failedTopics: 2,
        invalidTopicCount: 1,
      }),
    );

    expect(snapshot.topics).toMatchObject({
      status: 'partial',
      totalExpected: 3,
      fetchedCount: 1,
      failedCount: 2,
      identityFailureCount: 1,
    });
  });

  it('keeps topic failures at least as large as identity failures', () => {
    const snapshot = buildSnapshot(
      createTopicsResult({
        totalTopics: 1,
        fetchedTopics: 1,
        failedTopics: 0,
        invalidTopicCount: 2,
      }),
    );

    expect(snapshot.topics).toMatchObject({
      status: 'partial',
      totalExpected: 1,
      fetchedCount: 1,
      failedCount: 2,
      identityFailureCount: 2,
    });
    expect(isRawSnapshotV2(snapshot)).toBe(true);
  });

  it('retains replies with incomplete topic metadata and reports the failure once', () => {
    const invalidReply = createReply({ topicId: null, topicReplyCount: null });
    const snapshot = buildSnapshot(
      createTopicsResult(),
      createRepliesResult({
        data: [createReply(), invalidReply],
        totalReplies: 2,
        invalidReplyCount: 1,
      }),
    );

    expect(snapshot.replies).toMatchObject({
      status: 'partial',
      totalExpected: 2,
      fetchedCount: 2,
      failedCount: 1,
      identityFailureCount: 1,
    });
    expect(snapshot.replies.items).toHaveLength(2);
    expect(snapshot.replies.items).toContainEqual(
      expect.objectContaining({ topicId: null, topicReplyCount: null }),
    );
  });

  it('marks replies partial when the declared total is unknown', () => {
    const snapshot = buildSnapshot(
      createTopicsResult(),
      createRepliesResult({ totalReplies: null }),
    );

    expect(snapshot.replies).toMatchObject({
      status: 'partial',
      totalExpected: null,
      fetchedCount: 1,
      failedCount: 0,
    });
  });

  it('marks replies partial when fetched items exceed the declared total', () => {
    const snapshot = buildSnapshot(
      createTopicsResult(),
      createRepliesResult({
        data: [
          createReply(),
          createReply({ topicId: '101', topicReplyCount: 1, content: 'Another reply' }),
        ],
        totalReplies: 1,
      }),
    );

    expect(snapshot.replies).toMatchObject({
      status: 'partial',
      totalExpected: 1,
      fetchedCount: 2,
      failedCount: 1,
      identityFailureCount: 0,
    });
    expect(isRawSnapshotV2(snapshot)).toBe(true);
  });

  it('preserves reply page failures independently from missing item counts', () => {
    const snapshot = buildSnapshot(createTopicsResult(), createRepliesResult({ failedPages: 1 }));

    expect(snapshot.replies).toMatchObject({
      status: 'partial',
      totalExpected: 1,
      fetchedCount: 1,
      failedCount: 0,
      failedPageCount: 1,
    });
  });

  it('deduplicates conflicting topics and preserves replies with shared topic metadata', () => {
    const topics = [createTopic({ title: 'Old topic' }), createTopic({ title: 'New topic' })];
    const replies = [createReply({ content: 'Old reply' }), createReply({ content: 'New reply' })];
    const forward = buildSnapshot(
      createTopicsResult({
        topics,
        totalTopics: 1,
        fetchedTopics: 2,
      }),
      createRepliesResult({
        data: replies,
        totalReplies: 2,
      }),
    );
    const reversed = buildSnapshot(
      createTopicsResult({
        topics: [...topics].reverse(),
        totalTopics: 1,
        fetchedTopics: 2,
      }),
      createRepliesResult({ data: [...replies].reverse(), totalReplies: 2 }),
    );

    expect(forward.topics).toMatchObject({
      status: 'partial',
      duplicateConflictCount: 1,
    });
    expect(forward.replies).toMatchObject({
      status: 'complete',
      fetchedCount: 2,
      duplicateConflictCount: 0,
    });
    expect(forward.topics.items).toEqual(reversed.topics.items);
    expect(forward.replies.items).toEqual(reversed.replies.items);
    expect(forward.topics.items[0]?.title).toBe('New topic');
    expect(forward.replies.items.map((reply) => reply.content)).toEqual(['New reply', 'Old reply']);
  });

  it('deduplicates equivalent topics but preserves every reply record', () => {
    const topic = createTopic();
    const replies = [createReply(), createReply({ replyTime: '4 小时前' })];
    const forward = buildSnapshot(
      createTopicsResult({ topics: [topic, topic], totalTopics: 1, fetchedTopics: 2 }),
      createRepliesResult({ data: replies, totalReplies: 2 }),
    );
    const reversed = buildSnapshot(
      createTopicsResult({ topics: [topic, topic], totalTopics: 1, fetchedTopics: 2 }),
      createRepliesResult({ data: [...replies].reverse(), totalReplies: 2 }),
    );

    expect(forward.topics).toMatchObject({
      status: 'complete',
      fetchedCount: 1,
      duplicateConflictCount: 0,
    });
    expect(forward.replies).toMatchObject({
      status: 'complete',
      fetchedCount: 2,
      duplicateConflictCount: 0,
    });
    expect(forward.replies.items).toEqual(reversed.replies.items);
  });

  it('sorts topics and replies deterministically by topic and semantic fields', () => {
    const snapshot = buildSnapshot(
      createTopicsResult({
        topics: [
          createTopic({ topicId: '10', sourceUrl: 'https://www.v2ex.com/t/10' }),
          createTopic({ topicId: '1', sourceUrl: 'https://www.v2ex.com/t/1' }),
          createTopic({ topicId: '2', sourceUrl: 'https://www.v2ex.com/t/2' }),
        ],
        totalTopics: 3,
        fetchedTopics: 3,
      }),
      createRepliesResult({
        data: [
          createReply({ topicId: '10', topicReplyCount: 1, content: 'Topic 10 reply' }),
          createReply({ topicId: '2', topicReplyCount: 5, content: 'Later content' }),
          createReply({ topicId: '2', topicReplyCount: 1, content: 'Earlier content' }),
        ],
        totalReplies: 3,
      }),
    );

    expect(snapshot.topics.items.map((topic) => topic.topicId)).toEqual(['1', '2', '10']);
    expect(snapshot.replies.items.map((reply) => reply.content)).toEqual([
      'Earlier content',
      'Later content',
      'Topic 10 reply',
    ]);
  });

  it('reports missing topic heat without an identity failure', () => {
    const snapshot = buildSnapshot(
      createTopicsResult(),
      createRepliesResult({
        data: [createReply({ topicReplyCount: null })],
        invalidReplyCount: 0,
      }),
    );

    expect(snapshot.replies).toMatchObject({
      status: 'partial',
      fetchedCount: 1,
      failedCount: 1,
      identityFailureCount: 0,
    });
  });
});
