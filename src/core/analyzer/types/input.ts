/**
 * Analyzer 输入类型
 */

import type { V2exReply, V2exTopicDetail } from '@/core/v2ex/types/entities';
import type { UserProfileParseResult } from '@/core/v2ex/types/parse-result';
import type { SnapshotCollectionStatus } from '@/core/snapshot';

/** Internal Analyzer input adapted from a validated raw snapshot. */
export interface RawUserData {
  profile: UserProfileParseResult;
  topics: V2exTopicDetail[];
  replies: V2exReply[];
  topicsStatus: SnapshotCollectionStatus;
  repliesStatus: SnapshotCollectionStatus;
  isTopicsHidden: boolean;
}
