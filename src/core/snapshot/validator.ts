import type {
  RawSnapshotV2,
  ReplySnapshot,
  SnapshotCollection,
  SnapshotCollectionStatus,
  TopicSnapshot,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isStableTopicId(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

function isCollectionStatus(value: unknown): value is SnapshotCollectionStatus {
  return value === 'complete' || value === 'partial' || value === 'not_requested';
}

function isTopicSnapshot(value: unknown): value is TopicSnapshot {
  if (
    !isRecord(value) ||
    !isStableTopicId(value.topicId) ||
    typeof value.title !== 'string' ||
    typeof value.nodeName !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.content !== 'string' ||
    !isNonNegativeInteger(value.replyCount) ||
    !isNullableString(value.lastReplyAt) ||
    !isNonNegativeInteger(value.clickCount)
  ) {
    return false;
  }

  return value.sourceUrl === `https://www.v2ex.com/t/${value.topicId}`;
}

function isReplySnapshot(value: unknown): value is ReplySnapshot {
  if (
    !isRecord(value) ||
    typeof value.replyId !== 'string' ||
    !isStableTopicId(value.topicId) ||
    !isNonNegativeInteger(value.replyNumber) ||
    typeof value.topicTitle !== 'string' ||
    typeof value.nodeName !== 'string' ||
    typeof value.displayReplyTime !== 'string' ||
    !hasValidNormalizedReplyTime(value.occurredAt, value.timePrecision) ||
    typeof value.content !== 'string' ||
    typeof value.isDirectReply !== 'boolean' ||
    !isNullableString(value.replyTo)
  ) {
    return false;
  }

  return value.replyId === `${value.topicId}#reply${value.replyNumber}`;
}

function hasValidNormalizedReplyTime(occurredAt: unknown, timePrecision: unknown): boolean {
  if (occurredAt === null) {
    return timePrecision === 'unknown';
  }

  return (
    isCanonicalIsoTime(occurredAt) &&
    (timePrecision === 'minute' || timePrecision === 'hour' || timePrecision === 'day')
  );
}

function isSnapshotCollection<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is SnapshotCollection<T> {
  if (
    !isRecord(value) ||
    !isCollectionStatus(value.status) ||
    (value.totalExpected !== null && !isNonNegativeInteger(value.totalExpected)) ||
    !isNonNegativeInteger(value.fetchedCount) ||
    !isNonNegativeInteger(value.failedCount) ||
    !isNonNegativeInteger(value.failedPageCount) ||
    !isNonNegativeInteger(value.identityFailureCount) ||
    !Array.isArray(value.items) ||
    !value.items.every(isItem) ||
    value.fetchedCount !== value.items.length ||
    value.failedCount < value.identityFailureCount ||
    (value.totalExpected !== null && value.fetchedCount + value.failedCount < value.totalExpected)
  ) {
    return false;
  }

  if (value.status === 'not_requested') {
    return (
      value.totalExpected === null &&
      value.fetchedCount === 0 &&
      value.failedCount === 0 &&
      value.failedPageCount === 0 &&
      value.identityFailureCount === 0
    );
  }

  if (value.status === 'complete') {
    return (
      value.totalExpected === value.fetchedCount &&
      value.failedCount === 0 &&
      value.failedPageCount === 0 &&
      value.identityFailureCount === 0
    );
  }

  return (
    value.totalExpected === null ||
    value.failedCount > 0 ||
    value.failedPageCount > 0 ||
    value.identityFailureCount > 0
  );
}

function isTopicsCollection(value: unknown): value is RawSnapshotV2['topics'] {
  return (
    isRecord(value) &&
    typeof value.hidden === 'boolean' &&
    isSnapshotCollection(value, isTopicSnapshot)
  );
}

function hasUniqueItems<T>(items: T[], getIdentity: (item: T) => string): boolean {
  const identities = new Set<string>();
  for (const item of items) {
    const identity = getIdentity(item);
    if (identities.has(identity)) {
      return false;
    }
    identities.add(identity);
  }
  return true;
}

function isCanonicalIsoTime(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

/**
 * Validate the persisted Raw Snapshot V2 contract at the storage boundary.
 *
 * @param value - Parsed JSON value read from raw.json.
 * @returns Whether the value satisfies the complete Raw Snapshot V2 shape.
 */
export function isRawSnapshotV2(value: unknown): value is RawSnapshotV2 {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    typeof value.username !== 'string' ||
    !isCanonicalIsoTime(value.capturedAt) ||
    !isRecord(value.profile) ||
    typeof value.profile.joinDate !== 'string' ||
    (value.profile.dailyRanking !== null && !isNonNegativeInteger(value.profile.dailyRanking)) ||
    !isTopicsCollection(value.topics) ||
    !isSnapshotCollection(value.replies, isReplySnapshot)
  ) {
    return false;
  }

  return (
    hasUniqueItems(value.topics.items, (topic) => topic.topicId) &&
    hasUniqueItems(value.replies.items, (reply) => reply.replyId)
  );
}
