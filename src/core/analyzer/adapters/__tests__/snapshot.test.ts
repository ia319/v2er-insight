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
        displayReplyTime: 'unparseable display time',
        occurredAt: '2026-07-12T00:04:05.000Z',
        timePrecision: 'hour',
        content: 'Reply content',
        isDirectReply: false,
        replyTo: 'bob',
      },
    ],
  },
};

describe('createAnalyzerInput', () => {
  it('maps snapshot records without losing reply topic metadata', () => {
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
          topicId: '100',
          topicReplyCount: 2,
          topicTitle: 'Topic title',
          nodeName: 'create',
          occurredAt: new Date('2026-07-12T00:04:05.000Z'),
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

  it('uses the normalized reply occurrence instead of reparsing display text', () => {
    expect(buildAnalyzerOutputFromSnapshot(snapshot).userOverview.lastActiveTime).toBe(
      '2026-07-12T00:04:05.000Z',
    );
  });

  it('exposes snapshot collection quality in Analyzer output', () => {
    expect(buildAnalyzerOutputFromSnapshot(snapshot)).toMatchObject({
      schemaVersion: 2,
      dataQuality: {
        capturedAt: '2026-07-12T03:04:05.000Z',
        topics: {
          status: 'complete',
          totalExpected: 1,
          fetchedCount: 1,
          failedCount: 0,
        },
        replies: {
          status: 'complete',
          totalExpected: 1,
          fetchedCount: 1,
          failedCount: 0,
        },
      },
    });
  });

  it('preserves partial and not-requested quality states', () => {
    const incompleteSnapshot: RawSnapshotV2 = {
      ...snapshot,
      topics: {
        ...snapshot.topics,
        status: 'partial',
        totalExpected: 2,
        failedCount: 1,
      },
      replies: {
        status: 'not_requested',
        totalExpected: null,
        fetchedCount: 0,
        failedCount: 0,
        failedPageCount: 0,
        identityFailureCount: 0,
        duplicateConflictCount: 0,
        items: [],
      },
    };

    expect(buildAnalyzerOutputFromSnapshot(incompleteSnapshot).dataQuality).toEqual({
      capturedAt: snapshot.capturedAt,
      topics: {
        status: 'partial',
        totalExpected: 2,
        fetchedCount: 1,
        failedCount: 1,
      },
      replies: {
        status: 'not_requested',
        totalExpected: null,
        fetchedCount: 0,
        failedCount: 0,
      },
    });
  });
});
