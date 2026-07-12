/**
 * analyze 命令 — 分析已抓取的用户数据
 *
 * 读取 raw.json，执行 Analyzer，输出 analyzed.json。
 */

import type { AnalyzerOutput } from '@/core/analyzer';
import { buildAnalyzerOutputFromSnapshot } from '@/core/analyzer';
import { isRawSnapshotV2 } from '@/core/snapshot';
import { readDataFile, writeDataFile } from '@/infra/storage';
import { logger } from '@/infra/logger';
import { getRecoveryActions } from '../workflow/recovery';
import type { StepRunResult } from '../workflow/types';

/**
 * 打印分析统计摘要
 */
function printStats(output: AnalyzerOutput): void {
  const { userOverview, summary } = output;

  logger.section('=== 分析摘要 ===');
  logger.detail(`注册时间: ${userOverview.joinDate}`);
  logger.detail(`最后活跃: ${userOverview.lastActiveTime}`);

  if (userOverview.totalTopics !== null) {
    logger.detail(`帖子总数: ${userOverview.totalTopics}`);
  }
  if (userOverview.totalReplies !== null) {
    logger.detail(`回复总数: ${userOverview.totalReplies}`);
  }

  if (userOverview.topicReplyRatio !== null) {
    logger.detail(`帖/回比: ${userOverview.topicReplyRatio.toFixed(2)}`);
  }

  logger.detail(`活跃期数: ${summary.totalPeriods}`);
  logger.detail(`内容分片: ${output.contents.length}`);
}

/**
 * Analyze a validated Raw Snapshot V2 and persist Analyzer output.
 *
 * @param username - V2EX member name used to resolve data files.
 * @param options - Command output behavior.
 * @returns Structured analyze step status and output metadata.
 */
export async function runAnalyze(
  username: string,
  options: { pipeline?: boolean } = {},
): Promise<StepRunResult> {
  // 读取原始数据
  const rawData = readDataFile<unknown>(username, 'raw');

  if (rawData === null) {
    logger.error(`未找到 ${username} 的抓取数据`);
    logger.info('请先运行: v2er fetch <username>');
    return {
      step: 'analyze',
      status: 'failed',
      reasonCode: 'ANALYZE_INPUT_MISSING',
      message: '缺少 raw.json，无法执行分析',
      recoverable: true,
      recoverActions: getRecoveryActions('ANALYZE_INPUT_MISSING', { username }),
    };
  }

  if (!isRawSnapshotV2(rawData)) {
    logger.error(`${username} 的 raw.json 格式无效或不受支持`);
    return {
      step: 'analyze',
      status: 'failed',
      reasonCode: 'ANALYZE_FAILED',
      message: 'raw.json 格式无效或不受支持，无法执行分析',
      recoverable: true,
      recoverActions: getRecoveryActions('ANALYZE_FAILED', { username }),
    };
  }

  logger.info(`\n分析用户数据: ${username}`);

  try {
    const output = buildAnalyzerOutputFromSnapshot(rawData);

    writeDataFile(username, 'analyzed', output);

    if (!options.pipeline) {
      logger.success('分析结果已保存');
      printStats(output);
    }

    return {
      step: 'analyze',
      status: 'success',
      message: '分析完成',
      meta: {
        totalPeriods: output.summary.totalPeriods,
        contentChunks: output.contents.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`分析失败: ${message}`);
    return {
      step: 'analyze',
      status: 'failed',
      reasonCode: 'ANALYZE_FAILED',
      message: `分析失败: ${message}`,
      recoverable: true,
      recoverActions: getRecoveryActions('ANALYZE_FAILED', { username }),
    };
  }
}
