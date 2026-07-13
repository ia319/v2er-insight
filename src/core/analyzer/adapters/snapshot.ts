import type { RawSnapshotV2 } from '@/core/snapshot';
import type { RawUserData } from '../types';

/**
 * Convert a versioned snapshot into the Analyzer internal input model.
 *
 * @param snapshot - Validated Raw Snapshot V2.
 * @returns V2EX-shaped records consumed by Analyzer statistics and content modules.
 */
export function createAnalyzerInput(snapshot: RawSnapshotV2): RawUserData {
  return {
    profile: { ...snapshot.profile },
    topics: snapshot.topics.items.map((topic) => ({
      topicId: topic.topicId,
      sourceUrl: topic.sourceUrl,
      title: topic.title,
      nodeName: topic.nodeName,
      createdAt: topic.createdAt,
      content: topic.content,
      replyCount: topic.replyCount,
      lastReplyTime: topic.lastReplyAt,
      clickCount: topic.clickCount,
    })),
    replies: snapshot.replies.items.map((reply) => ({
      replyId: reply.replyId,
      topicId: reply.topicId,
      replyNumber: reply.replyNumber,
      topicTitle: reply.topicTitle,
      nodeName: reply.nodeName,
      occurredAt: reply.occurredAt === null ? null : new Date(reply.occurredAt),
      content: reply.content,
      isDirectReply: reply.isDirectReply,
      replyTo: reply.replyTo,
    })),
    topicsStatus: snapshot.topics.status,
    repliesStatus: snapshot.replies.status,
    isTopicsHidden: snapshot.topics.hidden,
  };
}
