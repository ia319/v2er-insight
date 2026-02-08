/**
 * 帖子统计计算
 */

import type { V2exTopicDetail } from '@/core/v2ex/types/entities';
import type { SinglePeriodStats } from '../types';
import { ANALYZER_CONFIG } from '../config';
import { parseAbsoluteDate, average, topN, hourDistribution, formatTimeRange } from '../utils';

interface TopicStatsInput {
  topics: V2exTopicDetail[];
  startDate: Date;
  endDate: Date;
}

/**
 * 计算帖子相关统计
 */
export function calculateTopicStats(
  input: TopicStatsInput,
): Pick<
  SinglePeriodStats,
  | 'timeRange'
  | 'topicCount'
  | 'avgTopicReplyCount'
  | 'avgTopicClickCount'
  | 'avgTopicLifecycleDays'
  | 'topicInteractionRatio'
  | 'topicHourDistribution'
  | 'topicNodeDistribution'
> {
  const { topics, startDate, endDate } = input;

  const replyCounts = topics.map((t) => t.replyCount);
  const clickCounts = topics.map((t) => t.clickCount);

  // 计算帖子生命周期
  const lifecycleDays = topics
    .map((t) => calculateLifecycleDays(t))
    .filter((d): d is number => d !== null);

  // 计算小时分布
  const topicDates = topics
    .map((t) => parseAbsoluteDate(t.createdAt)?.date)
    .filter((d): d is Date => d !== undefined);

  // 计算互动率
  const totalReplies = replyCounts.reduce((a, b) => a + b, 0);
  const totalClicks = clickCounts.reduce((a, b) => a + b, 0);

  return {
    timeRange: formatTimeRange(startDate, endDate),
    topicCount: topics.length,
    avgTopicReplyCount: average(replyCounts),
    avgTopicClickCount: average(clickCounts),
    avgTopicLifecycleDays: average(lifecycleDays),
    topicInteractionRatio: totalClicks > 0 ? totalReplies / totalClicks : 0,
    topicHourDistribution: hourDistribution(topicDates),
    topicNodeDistribution: topN(topics, (t) => t.nodeName, ANALYZER_CONFIG.NODE_DISTRIBUTION_TOP_N),
  };
}

/**
 * 计算帖子生命周期（天）
 */
function calculateLifecycleDays(topic: V2exTopicDetail): number | null {
  if (!topic.lastReplyTime) return null;

  const created = parseAbsoluteDate(topic.createdAt);
  const lastReply = parseAbsoluteDate(topic.lastReplyTime);

  if (!created || !lastReply) return null;

  const diffMs = lastReply.date.getTime() - created.date.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}
