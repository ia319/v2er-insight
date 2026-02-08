/**
 * 回复统计计算
 */

import type { V2exReply } from '@/core/v2ex/types/entities';
import type { SinglePeriodStats } from '../types';
import { ANALYZER_CONFIG } from '../config';
import { parseRelativeTime, average, topN, weekdayDistribution } from '../utils';

interface ReplyStatsInput {
  replies: V2exReply[];
  referenceDate?: Date;
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
  const { replies, referenceDate = new Date() } = input;

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

  // 计算参与话题热度
  const topicHeats = replies.map((r) => r.topicReplyCount);

  // 计算星期分布
  const replyDates = replies
    .map((r) => parseRelativeTime(r.replyTime, referenceDate)?.date)
    .filter((d): d is Date => d !== undefined);

  // 只有足够的解析成功才计算星期分布
  const weekdayDist =
    replyDates.length >= replies.length * 0.5 ? weekdayDistribution(replyDates) : null;

  return {
    replyCount: replies.length,
    avgReplyLength: average(lengths),
    directReplyRatio: directReplies / replies.length,
    avgRepliedTopicHeat: average(topicHeats),
    replyWeekdayDistribution: weekdayDist,
    replyNodeDistribution: topN(
      replies,
      (r) => r.nodeName,
      ANALYZER_CONFIG.NODE_DISTRIBUTION_TOP_N,
    ),
  };
}
