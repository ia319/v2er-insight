/**
 * Analyzer 输出类型
 */

import type { SnapshotCollectionStatus } from '@/core/snapshot';

/** Analyzer output schema persisted in analyzed.json. */
export const ANALYZER_OUTPUT_SCHEMA_VERSION = 2 as const;

/** Collection quality exposed to downstream AI providers. */
export interface SnapshotQuality {
  status: SnapshotCollectionStatus;
  totalExpected: number | null;
  fetchedCount: number;
  failedCount: number;
}

/** 用户总览 */
export interface UserOverview {
  joinDate: string;
  lastActiveTime: string;
  topicReplyRatio: number | null;
  totalTopics: number | null;
  totalReplies: number | null;
  isTopicsHidden: boolean;
  dailyRanking: number | null;
}

/** 单个活跃期统计 */
export interface SinglePeriodStats {
  timeRange: string;
  // 帖子统计
  topicCount: number;
  avgTopicReplyCount: number;
  avgTopicClickCount: number;
  avgTopicLifecycleDays: number;
  topicInteractionRatio: number;
  topicHourDistribution: Record<number, number>;
  topicNodeDistribution: Record<string, number>;
  // 回复统计
  replyCount: number;
  avgReplyLength: number;
  directReplyRatio: number;
  avgRepliedTopicHeat: number;
  replyWeekdayDistribution: Record<string, number> | null;
  replyNodeDistribution: Record<string, number>;
}

/** 活跃期统计汇总 */
export interface PeriodsSummary {
  totalPeriods: number;
  periods: SinglePeriodStats[];
}

/** 发送给 AI 的帖子 */
export interface ContentTopic {
  title: string;
  nodeName: string;
  content: string;
}

/** 发送给 AI 的回复 */
export interface ContentReply {
  topicTitle: string;
  nodeName: string;
  content: string;
}

/** 活跃期内容（完整版） */
export interface PeriodContent {
  periodIndex: number;
  topics: ContentTopic[];
  replies: ContentReply[];
}

/** 活跃期内容分片 */
export interface PeriodContentChunk {
  periodIndex: number;
  chunkIndex: number;
  totalChunksInPeriod: number;
  topics: ContentTopic[];
  replies: ContentReply[];
}

/** Analyzer 最终输出 */
export interface AnalyzerOutput {
  schemaVersion: typeof ANALYZER_OUTPUT_SCHEMA_VERSION;
  dataQuality: {
    capturedAt: string;
    topics: SnapshotQuality;
    replies: SnapshotQuality;
  };
  userOverview: UserOverview;
  summary: PeriodsSummary;
  contents: Array<PeriodContent | PeriodContentChunk>;
}
