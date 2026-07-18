/**
 * 回复统计计算
 */

import type { AnalyzerReply, SinglePeriodStats } from '../types';
import { getConfig } from '@/config';
import { average, topN, weekdayDistribution } from '../utils';

interface ReplyStatsInput {
  replies: AnalyzerReply[];
}

/**
 * 计算回复相关统计
 */
export function calculateReplyStats(
  input: ReplyStatsInput,
): Pick<
  SinglePeriodStats,
  | 'replyCount'
  | 'avgReplyLength'
  | 'directReplyRatio'
  | 'avgRepliedTopicHeat'
  | 'replyWeekdayDistribution'
  | 'replyNodeDistribution'
> {
  const { replies } = input;

  if (replies.length === 0) {
    return {
      replyCount: 0,
      avgReplyLength: 0,
      directReplyRatio: 0,
      avgRepliedTopicHeat: 0,
      replyWeekdayDistribution: null,
      replyNodeDistribution: {},
    };
  }

  // 计算平均长度
  const lengths = replies.map((r) => r.content.length);

  // 计算直接回复率
  const directReplies = replies.filter((r) => r.isDirectReply).length;

  // The member reply page anchors point to each topic's current last reply.
  const topicReplyCounts = replies
    .map((reply) => reply.topicReplyCount)
    .filter((replyCount): replyCount is number => replyCount !== null);

  // 计算星期分布
  const replyDates = replies
    .map((reply) => reply.occurredAt)
    .filter((occurredAt): occurredAt is Date => occurredAt !== null);

  // 只有足够的解析成功才计算星期分布
  const weekdayDist =
    replyDates.length >= replies.length * 0.5 ? weekdayDistribution(replyDates) : null;

  return {
    replyCount: replies.length,
    avgReplyLength: average(lengths),
    directReplyRatio: directReplies / replies.length,
    avgRepliedTopicHeat: average(topicReplyCounts),
    replyWeekdayDistribution: weekdayDist,
    replyNodeDistribution: topN(
      replies,
      (r) => r.nodeName,
      getConfig().analyzer?.nodeDistributionTopN ?? 3,
    ),
  };
}
