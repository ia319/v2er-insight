/**
 * 用户总览计算
 */

import type { RawUserData, UserOverview } from '../types';
import { parseAbsoluteDate } from '../utils';

/**
 * 计算用户总览
 */
export function calculateUserOverview(data: RawUserData): UserOverview {
  const { profile, topics, replies, topicsStatus, repliesStatus, isTopicsHidden } = data;

  // 计算最后活动时间
  const lastActiveTime = getLastActiveTime(topics, replies);

  // Calculate the ratio only when both collections were requested and replies exist.
  const hasRequestedTopics = topicsStatus !== 'not_requested';
  const hasRequestedReplies = repliesStatus !== 'not_requested';
  const topicReplyRatio =
    hasRequestedTopics && hasRequestedReplies && replies.length > 0
      ? topics.length / replies.length
      : null;

  return {
    joinDate: profile.joinDate,
    lastActiveTime,
    topicReplyRatio,
    totalTopics: isTopicsHidden || !hasRequestedTopics ? null : topics.length,
    totalReplies: hasRequestedReplies ? replies.length : null,
    isTopicsHidden,
    dailyRanking: profile.dailyRanking,
  };
}

/**
 * 获取最后活动时间
 */
function getLastActiveTime(topics: RawUserData['topics'], replies: RawUserData['replies']): string {
  let lastDate: Date | null = null;

  // 检查帖子的最后时间
  for (const topic of topics) {
    const parsed = parseAbsoluteDate(topic.createdAt);
    if (parsed && (!lastDate || parsed.date > lastDate)) {
      lastDate = parsed.date;
    }
  }

  // 检查回复的最后时间
  for (const reply of replies) {
    if (reply.occurredAt && (!lastDate || reply.occurredAt > lastDate)) {
      lastDate = reply.occurredAt;
    }
  }

  if (!lastDate) {
    return 'unknown';
  }

  // 格式化为 ISO 字符串
  return lastDate.toISOString();
}
