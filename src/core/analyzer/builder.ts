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
import { ANALYZER_OUTPUT_SCHEMA_VERSION } from './types';
import { detectPeriodBoundaries, splitByPeriods } from './periods';
import { calculateUserOverview } from './stats/user-overview';
import { calculateTopicStats } from './stats/topic-stats';
import { calculateReplyStats } from './stats/reply-stats';
import { chunkPeriodContent } from './content';
import { parseAbsoluteDate } from './utils';
import type { RawSnapshotV2 } from '@/core/snapshot';
import { createAnalyzerInput } from './adapters/snapshot';

/**
 * Builds the core metrics and content fields used by AnalyzerOutput.
 *
 * @param data - Internal input adapted from a validated raw snapshot.
 * @returns User overview, period summary, and content chunks.
 */
function buildAnalyzerCoreOutput(
  data: RawUserData,
): Pick<AnalyzerOutput, 'userOverview' | 'summary' | 'contents'> {
  // 1. 计算用户总览
  const userOverview = calculateUserOverview(data);

  // 2. 提取所有活动日期并排序
  const activities = extractActivities(data);

  // 3. 检测活跃期边界
  const boundaries = detectPeriodBoundaries(activities);

  // 4. 将数据分割到各活跃期
  const periods = splitByPeriods(boundaries, data.topics, data.replies);

  // 5. 计算每个活跃期的统计
  const periodStats = periods.map((period) => calculatePeriodStats(period));

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
 * Builds Analyzer output from a validated versioned snapshot.
 *
 * @param snapshot - Validated Raw Snapshot V2.
 * @returns Analyzer output using normalized reply occurrences from the snapshot.
 */
export function buildAnalyzerOutputFromSnapshot(snapshot: RawSnapshotV2): AnalyzerOutput {
  const coreOutput = buildAnalyzerCoreOutput(createAnalyzerInput(snapshot));

  return {
    schemaVersion: ANALYZER_OUTPUT_SCHEMA_VERSION,
    dataQuality: {
      capturedAt: snapshot.capturedAt,
      topics: {
        status: snapshot.topics.status,
        totalExpected: snapshot.topics.totalExpected,
        fetchedCount: snapshot.topics.fetchedCount,
        failedCount: snapshot.topics.failedCount,
      },
      replies: {
        status: snapshot.replies.status,
        totalExpected: snapshot.replies.totalExpected,
        fetchedCount: snapshot.replies.fetchedCount,
        failedCount: snapshot.replies.failedCount,
      },
    },
    ...coreOutput,
  };
}

/**
 * 从原始数据中提取所有活动日期
 * 用于检测活跃期边界
 */
function extractActivities(data: RawUserData): Array<{ date: Date }> {
  const activities: Array<{ date: Date }> = [];

  // 从帖子提取日期（绝对时间）
  for (const topic of data.topics) {
    const parsed = parseAbsoluteDate(topic.createdAt);
    if (parsed) {
      activities.push({ date: parsed.date });
    }
  }

  // 从回复提取 Snapshot 已规范化的日期
  for (const reply of data.replies) {
    if (reply.occurredAt) {
      activities.push({ date: reply.occurredAt });
    }
  }

  // 按日期升序排序
  activities.sort((a, b) => a.date.getTime() - b.date.getTime());

  return activities;
}

/**
 * 计算单个活跃期的统计
 */
function calculatePeriodStats(period: ActivePeriod): SinglePeriodStats {
  const topicStats = calculateTopicStats({
    topics: period.topics,
    startDate: period.startDate,
    endDate: period.endDate,
  });

  const replyStats = calculateReplyStats({
    replies: period.replies,
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
