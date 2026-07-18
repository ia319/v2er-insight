/**
 * Analyzer 输入类型
 */

import type { V2exTopicDetail } from '@/core/v2ex/types/entities';
import type { UserProfileParseResult } from '@/core/v2ex/types/parse-result';
import type { SnapshotCollectionStatus } from '@/core/snapshot';

/** Reply record normalized at the Snapshot-to-Analyzer boundary. */
export interface AnalyzerReply {
  /** Stable topic identity when the source topic path is valid. */
  topicId: string | null;
  /** Topic reply count captured from the member-page last-reply anchor. */
  topicReplyCount: number | null;
  topicTitle: string;
  nodeName: string;
  occurredAt: Date | null;
  content: string;
  isDirectReply: boolean;
  replyTo: string | null;
}

/** Internal Analyzer input adapted from a validated raw snapshot. */
export interface RawUserData {
  profile: UserProfileParseResult;
  topics: V2exTopicDetail[];
  replies: AnalyzerReply[];
  topicsStatus: SnapshotCollectionStatus;
  repliesStatus: SnapshotCollectionStatus;
  isTopicsHidden: boolean;
}
