/**
 * Analyzer 内部类型
 */

import type { V2exTopicDetail } from '@/core/v2ex/types/entities';
import type { AnalyzerReply } from './input';

/** 活跃期：两个暂停期之间的连续活动时间段 */
export interface ActivePeriod {
  index: number;
  startDate: Date;
  endDate: Date;
  topics: V2exTopicDetail[];
  replies: AnalyzerReply[];
}

/** 带解析日期的帖子 */
export interface TopicWithDate {
  topic: V2exTopicDetail;
  createdDate: Date;
}

/** 带解析日期的回复 */
export interface ReplyWithDate {
  reply: AnalyzerReply;
  replyDate: Date;
}

/** 活跃期边界 */
export interface PeriodBoundary {
  startDate: Date;
  endDate: Date;
}
