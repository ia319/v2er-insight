import type {
  UserProfileParseResult,
  UserRepliesResult,
  UserTopicsDetailResult,
  V2exReply,
  V2exTopicDetail,
} from '@/core/v2ex';
import {
  RAW_SNAPSHOT_SCHEMA_VERSION,
  type RawSnapshotV2,
  type ReplySnapshot,
  type SnapshotCollection,
  type TopicSnapshot,
} from './types';

/** Requested scope paired with its required fetch result. */
export type SnapshotRequest<T> =
  | { requested: false; result?: never }
  | { requested: true; result: T };

/** Inputs captured during one fetch command execution. */
export interface BuildRawSnapshotInput {
  username: string;
  capturedAt: Date;
  profile: UserProfileParseResult;
  topics: SnapshotRequest<UserTopicsDetailResult>;
  replies: SnapshotRequest<UserRepliesResult>;
}

function createNotRequestedCollection<T>(): SnapshotCollection<T> {
  return {
    status: 'not_requested',
    totalExpected: null,
    fetchedCount: 0,
    failedCount: 0,
    failedPageCount: 0,
    identityFailureCount: 0,
    items: [],
  };
}

function mapTopic(topic: V2exTopicDetail): TopicSnapshot {
  return {
    topicId: topic.topicId,
    sourceUrl: topic.sourceUrl,
    title: topic.title,
    nodeName: topic.nodeName,
    createdAt: topic.createdAt,
    content: topic.content,
    replyCount: topic.replyCount,
    lastReplyAt: topic.lastReplyTime,
    clickCount: topic.clickCount,
  };
}

function buildTopicsCollection(
  data: SnapshotRequest<UserTopicsDetailResult>,
): RawSnapshotV2['topics'] {
  if (!data.requested) {
    return {
      ...createNotRequestedCollection<TopicSnapshot>(),
      hidden: false,
    };
  }

  const { result } = data;
  const topicsById = new Map<string, TopicSnapshot>();
  for (const topic of result.topics) {
    topicsById.set(topic.topicId, mapTopic(topic));
  }

  const items = Array.from(topicsById.values());
  const failedCount = Math.max(result.failedTopics, result.totalTopics - items.length);
  const totalExpected = result.failedPages > 0 ? null : result.totalTopics;
  const isPartial = result.failedPages > 0 || failedCount > 0 || result.invalidTopicCount > 0;

  return {
    status: isPartial ? 'partial' : 'complete',
    totalExpected,
    fetchedCount: items.length,
    failedCount,
    failedPageCount: result.failedPages,
    identityFailureCount: result.invalidTopicCount,
    items,
    hidden: result.isHidden,
  };
}

function hasStableReplyIdentity(
  reply: V2exReply,
): reply is V2exReply & { replyId: string; topicId: string; replyNumber: number } {
  if (reply.replyId === null || reply.topicId === null || reply.replyNumber === null) {
    return false;
  }

  return reply.replyId === `${reply.topicId}#reply${reply.replyNumber}`;
}

function mapReply(
  reply: V2exReply & { replyId: string; topicId: string; replyNumber: number },
): ReplySnapshot {
  return {
    replyId: reply.replyId,
    topicId: reply.topicId,
    replyNumber: reply.replyNumber,
    topicTitle: reply.topicTitle,
    nodeName: reply.nodeName,
    displayReplyTime: reply.replyTime,
    occurredAt: null,
    timePrecision: 'unknown',
    content: reply.content,
    isDirectReply: reply.isDirectReply,
    replyTo: reply.replyTo,
  };
}

function buildRepliesCollection(
  data: SnapshotRequest<UserRepliesResult>,
): RawSnapshotV2['replies'] {
  if (!data.requested) {
    return createNotRequestedCollection<ReplySnapshot>();
  }

  const { result } = data;
  const repliesById = new Map<string, ReplySnapshot>();
  let detectedIdentityFailures = 0;

  for (const reply of result.data) {
    if (!hasStableReplyIdentity(reply)) {
      detectedIdentityFailures++;
      continue;
    }

    repliesById.set(reply.replyId, mapReply(reply));
  }

  const items = Array.from(repliesById.values());
  const identityFailureCount = Math.max(result.invalidReplyCount, detectedIdentityFailures);
  const failedCount =
    result.totalReplies === null
      ? identityFailureCount
      : Math.max(result.totalReplies - items.length, identityFailureCount);
  const isPartial =
    result.totalReplies === null ||
    result.failedPages > 0 ||
    failedCount > 0 ||
    identityFailureCount > 0;

  return {
    status: isPartial ? 'partial' : 'complete',
    totalExpected: result.totalReplies,
    fetchedCount: items.length,
    failedCount,
    failedPageCount: result.failedPages,
    identityFailureCount,
    items,
  };
}

/**
 * Build a versioned raw snapshot from one fetch execution.
 *
 * @param input - Profile, requested scopes, results, and shared capture time.
 * @returns A Raw Snapshot V2 with explicit completeness metadata.
 */
export function buildRawSnapshot(input: BuildRawSnapshotInput): RawSnapshotV2 {
  return {
    schemaVersion: RAW_SNAPSHOT_SCHEMA_VERSION,
    username: input.username,
    capturedAt: input.capturedAt.toISOString(),
    profile: {
      joinDate: input.profile.joinDate,
      dailyRanking: input.profile.dailyRanking,
    },
    topics: buildTopicsCollection(input.topics),
    replies: buildRepliesCollection(input.replies),
  };
}
