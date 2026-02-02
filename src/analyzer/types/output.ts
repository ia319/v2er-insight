/**
 * Analyzer 输出类型
 */

/** 用户总览 */
export interface UserOverview {
  joinDate: string;
  lastActiveTime: string;
  topicReplyRatio: number;
  totalTopics: number;
  totalReplies: number;
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
  userOverview: UserOverview;
  summary: PeriodsSummary;
  contents: Array<PeriodContent | PeriodContentChunk>;
}
