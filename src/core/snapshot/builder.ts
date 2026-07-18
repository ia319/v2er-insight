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
import { normalizeReplyTime } from './reply-time';

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
    duplicateConflictCount: 0,
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

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareNumericIds(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+/, '') || '0';
  const normalizedRight = right.replace(/^0+/, '') || '0';

  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length - normalizedRight.length;
  }

  return compareStrings(normalizedLeft, normalizedRight) || compareStrings(left, right);
}

function compareNullableNumericIds(left: string | null, right: string | null): number {
  if (left === null) {
    return right === null ? 0 : 1;
  }

  if (right === null) {
    return -1;
  }

  return compareNumericIds(left, right);
}

interface DeduplicatedRecords<T> {
  records: T[];
  duplicateConflictCount: number;
}

interface SelectedRecord<T> {
  record: T;
  conflictKey: string;
  selectionKey: string;
}

/**
 * Deduplicate records without allowing input order to select a conflicting value.
 *
 * All duplicate candidates use a fixed-field selection key. Candidates whose
 * semantic conflict keys differ report the affected stable identity once.
 */
function deduplicateRecords<T>(
  records: T[],
  getIdentity: (record: T) => string,
  getConflictKey: (record: T) => string,
  getSelectionKey: (record: T) => string = getConflictKey,
): DeduplicatedRecords<T> {
  const selectedByIdentity = new Map<string, SelectedRecord<T>>();
  const conflictingIdentities = new Set<string>();

  for (const record of records) {
    const identity = getIdentity(record);
    const conflictKey = getConflictKey(record);
    const selectionKey = getSelectionKey(record);
    const existing = selectedByIdentity.get(identity);

    if (!existing) {
      selectedByIdentity.set(identity, { record, conflictKey, selectionKey });
      continue;
    }

    if (existing.conflictKey !== conflictKey) {
      conflictingIdentities.add(identity);
    }

    if (selectionKey < existing.selectionKey) {
      selectedByIdentity.set(identity, { record, conflictKey, selectionKey });
    }
  }

  return {
    records: Array.from(selectedByIdentity.values(), (selected) => selected.record),
    duplicateConflictCount: conflictingIdentities.size,
  };
}

function getTopicConflictKey(topic: TopicSnapshot): string {
  return JSON.stringify([
    topic.sourceUrl,
    topic.title,
    topic.nodeName,
    topic.createdAt,
    topic.content,
    topic.replyCount,
    topic.lastReplyAt,
    topic.clickCount,
  ]);
}

function getReplySortKey(reply: ReplySnapshot): string {
  return JSON.stringify([
    reply.topicTitle,
    reply.nodeName,
    reply.content,
    reply.isDirectReply,
    reply.replyTo,
    reply.topicReplyCount,
    reply.displayReplyTime,
    reply.occurredAt,
    reply.timePrecision,
  ]);
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
  const deduplicated = deduplicateRecords(
    result.topics.map(mapTopic),
    (topic) => topic.topicId,
    getTopicConflictKey,
  );
  const items = deduplicated.records.sort((left, right) =>
    compareNumericIds(left.topicId, right.topicId),
  );
  const failedCount = Math.max(
    result.failedTopics,
    result.totalTopics - items.length,
    result.invalidTopicCount,
  );
  const totalExpected = result.failedPages > 0 ? null : result.totalTopics;
  const isPartial =
    result.failedPages > 0 || failedCount > 0 || deduplicated.duplicateConflictCount > 0;

  return {
    status: isPartial ? 'partial' : 'complete',
    totalExpected,
    fetchedCount: items.length,
    failedCount,
    failedPageCount: result.failedPages,
    identityFailureCount: result.invalidTopicCount,
    duplicateConflictCount: deduplicated.duplicateConflictCount,
    items,
    hidden: result.isHidden,
  };
}

function mapReply(reply: V2exReply, capturedAt: Date): ReplySnapshot {
  const normalizedTime = normalizeReplyTime(reply.replyTime, capturedAt);

  return {
    topicId: reply.topicId,
    topicReplyCount: reply.topicReplyCount,
    topicTitle: reply.topicTitle,
    nodeName: reply.nodeName,
    displayReplyTime: reply.replyTime,
    occurredAt: normalizedTime.occurredAt,
    timePrecision: normalizedTime.timePrecision,
    content: reply.content,
    isDirectReply: reply.isDirectReply,
    replyTo: reply.replyTo,
  };
}

function buildRepliesCollection(
  data: SnapshotRequest<UserRepliesResult>,
  capturedAt: Date,
): RawSnapshotV2['replies'] {
  if (!data.requested) {
    return createNotRequestedCollection<ReplySnapshot>();
  }

  const { result } = data;
  const items = result.data
    .map((reply) => mapReply(reply, capturedAt))
    .sort((left, right) => {
      const topicComparison = compareNullableNumericIds(left.topicId, right.topicId);
      return topicComparison || compareStrings(getReplySortKey(left), getReplySortKey(right));
    });
  const detectedMetadataFailures = result.data.filter(
    (reply) => reply.topicId === null || reply.topicReplyCount === null,
  ).length;
  const identityFailureCount = result.data.filter((reply) => reply.topicId === null).length;
  const countDifference =
    result.totalReplies === null ? 0 : Math.abs(result.totalReplies - items.length);
  const failedCount = Math.max(countDifference, result.invalidReplyCount, detectedMetadataFailures);
  const isPartial = result.totalReplies === null || result.failedPages > 0 || failedCount > 0;

  return {
    status: isPartial ? 'partial' : 'complete',
    totalExpected: result.totalReplies,
    fetchedCount: items.length,
    failedCount,
    failedPageCount: result.failedPages,
    identityFailureCount,
    duplicateConflictCount: 0,
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
    replies: buildRepliesCollection(input.replies, input.capturedAt),
  };
}
