/**
 * 数据分割器
 * 将帖子和回复分配到对应的活跃期
 */

import type { V2exReply, V2exTopicDetail } from '@/core/v2ex/types/entities';
import type { ActivePeriod, PeriodBoundary } from '../types';
import { parseAbsoluteDate, parseRelativeTime } from '../utils';

/**
 * 将帖子和回复分配到各活跃期
 */
export function splitByPeriods(
  boundaries: PeriodBoundary[],
  topics: V2exTopicDetail[],
  replies: V2exReply[],
  referenceDate: Date = new Date(),
): ActivePeriod[] {
  return boundaries.map((boundary, index) => {
    const periodTopics = topics.filter((topic) => {
      const parsed = parseAbsoluteDate(topic.createdAt);
      if (!parsed) return false;
      return parsed.date >= boundary.startDate && parsed.date <= boundary.endDate;
    });

    const periodReplies = replies.filter((reply) => {
      const parsed = parseRelativeTime(reply.replyTime, referenceDate);
      if (!parsed) return false;
      return parsed.date >= boundary.startDate && parsed.date <= boundary.endDate;
    });

    return {
      index,
      startDate: boundary.startDate,
      endDate: boundary.endDate,
      topics: periodTopics,
      replies: periodReplies,
    };
  });
}
