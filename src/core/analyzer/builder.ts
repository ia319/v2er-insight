/**
 * Analyzer 输出构建器
 * 整合所有模块，生成最终的 AI 输入数据
 */

import type { RawUserData, ActivePeriod } from './types';
import type {
  AnalyzerOutput,
  PeriodsSummary,
  SinglePeriodStats,
  PeriodContent,
  PeriodContentChunk,
} from './types';
import { detectPeriodBoundaries, splitByPeriods } from './periods';
import { calculateUserOverview } from './stats/user-overview';
import { calculateTopicStats } from './stats/topic-stats';
import { calculateReplyStats } from './stats/reply-stats';
import { chunkPeriodContent } from './content';
import { parseAbsoluteDate, parseRelativeTime } from './utils';
import type { RawSnapshotV2 } from '@/core/snapshot';
import { createAnalyzerInput } from './adapters/snapshot';

/**
 * 构建完整的 Analyzer 输出
 *
 * 处理流程：
 * 1. 计算用户总览
 * 2. 提取所有活动日期
 * 3. 检测活跃期边界
 * 4. 将数据分割到各活跃期
 * 5. 计算每个活跃期的统计
 * 6. 转换并分片内容
 *
 * @param data - V2EX 抓取的原始用户数据
 * @param referenceDate - 参考日期（用于相对时间解析）
 * @returns 完整的 Analyzer 输出
 */
export function buildAnalyzerOutput(
  data: RawUserData,
  referenceDate: Date = new Date(),
): AnalyzerOutput {
  // 1. 计算用户总览
  const userOverview = calculateUserOverview(data, referenceDate);

  // 2. 提取所有活动日期并排序
  const activities = extractActivities(data, referenceDate);

  // 3. 检测活跃期边界
  const boundaries = detectPeriodBoundaries(activities);

  // 4. 将数据分割到各活跃期
  const periods = splitByPeriods(boundaries, data.topics, data.replies, referenceDate);

  // 5. 计算每个活跃期的统计
  const periodStats = periods.map((period) => calculatePeriodStats(period, referenceDate));

  // 6. 构建 PeriodsSummary
  const summary: PeriodsSummary = {
    totalPeriods: periods.length,
    periods: periodStats,
  };

  // 7. 转换并分片内容
  const contents = buildContents(periods);

  return {
    userOverview,
    summary,
    contents,
  };
}

/**
 * Build Analyzer output from a validated versioned snapshot.
 *
 * @param snapshot - Validated Raw Snapshot V2.
 * @returns Analyzer output using the snapshot capture time as the time reference.
 */
export function buildAnalyzerOutputFromSnapshot(snapshot: RawSnapshotV2): AnalyzerOutput {
  return buildAnalyzerOutput(createAnalyzerInput(snapshot), new Date(snapshot.capturedAt));
}

/**
 * 从原始数据中提取所有活动日期
 * 用于检测活跃期边界
 */
function extractActivities(data: RawUserData, referenceDate: Date): Array<{ date: Date }> {
  const activities: Array<{ date: Date }> = [];

  // 从帖子提取日期（绝对时间）
  for (const topic of data.topics) {
    const parsed = parseAbsoluteDate(topic.createdAt);
    if (parsed) {
      activities.push({ date: parsed.date });
    }
  }

  // 从回复提取日期（相对时间）
  for (const reply of data.replies) {
    const parsed = parseRelativeTime(reply.replyTime, referenceDate);
    if (parsed) {
      activities.push({ date: parsed.date });
    }
  }

  // 按日期升序排序
  activities.sort((a, b) => a.date.getTime() - b.date.getTime());

  return activities;
}

/**
 * 计算单个活跃期的统计
 */
function calculatePeriodStats(period: ActivePeriod, referenceDate: Date): SinglePeriodStats {
  const topicStats = calculateTopicStats({
    topics: period.topics,
    startDate: period.startDate,
    endDate: period.endDate,
  });

  const replyStats = calculateReplyStats({
    replies: period.replies,
    referenceDate,
  });

  return {
    ...topicStats,
    ...replyStats,
  };
}

/**
 * 构建所有活跃期的内容
 */
function buildContents(periods: ActivePeriod[]): Array<PeriodContent | PeriodContentChunk> {
  const contents: Array<PeriodContent | PeriodContentChunk> = [];

  for (const period of periods) {
    const result = chunkPeriodContent(period);

    if (Array.isArray(result)) {
      // 分片结果
      contents.push(...result);
    } else {
      // 完整内容
      contents.push(result);
    }
  }

  return contents;
}
