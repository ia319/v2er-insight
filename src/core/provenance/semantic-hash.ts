import type { RawSnapshotV2, ReplySnapshot, TopicSnapshot } from '@/core/snapshot';
import { hashCanonicalJson } from './canonical-json';

type CollectionQuality = Pick<
  RawSnapshotV2['replies'],
  | 'status'
  | 'totalExpected'
  | 'failedCount'
  | 'failedPageCount'
  | 'identityFailureCount'
  | 'duplicateConflictCount'
>;

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function projectTopic(topic: TopicSnapshot) {
  return {
    topicId: topic.topicId,
    title: topic.title,
    nodeName: topic.nodeName,
    createdAt: topic.createdAt,
    content: topic.content,
    replyCount: topic.replyCount,
    clickCount: topic.clickCount,
  };
}

function projectReply(reply: ReplySnapshot) {
  return {
    topicId: reply.topicId,
    topicReplyCount: reply.topicReplyCount,
    topicTitle: reply.topicTitle,
    nodeName: reply.nodeName,
    content: reply.content,
    isDirectReply: reply.isDirectReply,
    replyTo: reply.replyTo,
  };
}

function getReplySemanticSortKey(reply: ReplySnapshot): string {
  return JSON.stringify([
    reply.topicId,
    reply.topicReplyCount,
    reply.topicTitle,
    reply.nodeName,
    reply.content,
    reply.isDirectReply,
    reply.replyTo,
  ]);
}

function projectCollectionQuality(collection: CollectionQuality) {
  return {
    status: collection.status,
    totalExpected: collection.totalExpected,
    failedCount: collection.failedCount,
    failedPageCount: collection.failedPageCount,
    identityFailureCount: collection.identityFailureCount,
    duplicateConflictCount: collection.duplicateConflictCount,
  };
}

function createSemanticProjection(snapshot: RawSnapshotV2) {
  return {
    profile: {
      joinDate: snapshot.profile.joinDate,
    },
    topics: {
      ...projectCollectionQuality(snapshot.topics),
      hidden: snapshot.topics.hidden,
      items: snapshot.topics.items
        .map(projectTopic)
        .sort((left, right) => compareStrings(left.topicId, right.topicId)),
    },
    replies: {
      ...projectCollectionQuality(snapshot.replies),
      items: [...snapshot.replies.items]
        .sort((left, right) =>
          compareStrings(getReplySemanticSortKey(left), getReplySemanticSortKey(right)),
        )
        .map(projectReply),
    },
  };
}

/** Computes the semantic identity of one validated raw snapshot. */
export function computeSemanticDataHash(snapshot: RawSnapshotV2): string {
  return hashCanonicalJson(createSemanticProjection(snapshot));
}
