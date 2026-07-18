/**
 * analyze 命令 — 分析已抓取的用户数据
 *
 * 读取 raw.json，执行 Analyzer，输出 analyzed.json。
 */

import type { AnalyzerOutput } from '@/core/analyzer';
import { buildAnalyzerOutputFromSnapshot } from '@/core/analyzer';
import type { RawProvenanceState } from '@/core/provenance';
import { recordAnalyzedProvenance, recordRawProvenance } from '@/core/provenance';
import { isRawSnapshotV2 } from '@/core/snapshot';
import { getConfig } from '@/config';
import {
  readAnalysisState,
  readDataFile,
  updateAnalysisState,
  writeDataFile,
} from '@/infra/storage';
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
 * Analyzes a validated Raw Snapshot V2 and persists Analyzer output.
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

  const analysisState = readAnalysisState(username);
  if (analysisState.status === 'invalid') {
    logger.error(`${username} 的 analysis-state.json 无效或不可读`);
    return {
      step: 'analyze',
      status: 'failed',
      reasonCode: 'PROVENANCE_STATE_INVALID',
      message: 'analysis-state.json 无效或不可读，无法验证分析来源',
      recoverable: true,
      recoverActions: getRecoveryActions('PROVENANCE_STATE_INVALID', { username }),
    };
  }

  if (analysisState.status === 'missing' || !analysisState.state.raw) {
    logger.error(`${username} 的 raw.json 缺少 provenance 状态`);
    return {
      step: 'analyze',
      status: 'failed',
      reasonCode: 'ANALYZE_PROVENANCE_MISSING',
      message: 'raw.json 缺少 provenance，无法安全执行变化检测',
      recoverable: true,
      recoverActions: getRecoveryActions('ANALYZE_PROVENANCE_MISSING', { username }),
    };
  }

  let expectedRawState: RawProvenanceState;
  try {
    expectedRawState = recordRawProvenance(analysisState.state, rawData).raw;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`计算 raw provenance 失败: ${message}`);
    return {
      step: 'analyze',
      status: 'failed',
      reasonCode: 'ANALYZE_FAILED',
      message: `计算 raw provenance 失败: ${message}`,
      recoverable: true,
      recoverActions: getRecoveryActions('ANALYZE_FAILED', { username }),
    };
  }

  if (
    analysisState.state.raw.semanticDataHash !== expectedRawState.semanticDataHash ||
    analysisState.state.raw.captureStatus !== expectedRawState.captureStatus
  ) {
    logger.error(`${username} 的 raw.json 与 provenance 状态不匹配`);
    return {
      step: 'analyze',
      status: 'failed',
      reasonCode: 'ANALYZE_SOURCE_MISMATCH',
      message: 'raw.json 与 provenance 状态不匹配，无法确认分析来源',
      recoverable: true,
      recoverActions: getRecoveryActions('ANALYZE_SOURCE_MISMATCH', { username }),
    };
  }

  logger.info(`\n分析用户数据: ${username}`);

  try {
    const output = buildAnalyzerOutputFromSnapshot(rawData);

    writeDataFile(username, 'analyzed', output);

    try {
      updateAnalysisState(username, (state) => {
        if (
          state.raw?.semanticDataHash !== expectedRawState.semanticDataHash ||
          state.raw?.captureStatus !== expectedRawState.captureStatus
        ) {
          throw new Error('raw provenance changed during analysis');
        }

        return recordAnalyzedProvenance(state, rawData, output, getConfig().analyzer);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`更新 provenance 状态失败: ${message}`);
      return {
        step: 'analyze',
        status: 'failed',
        reasonCode: 'PROVENANCE_UPDATE_FAILED',
        message: `analyzed.json 已保存，但 provenance 状态更新失败: ${message}`,
        recoverable: true,
        recoverActions: getRecoveryActions('PROVENANCE_UPDATE_FAILED', { username }),
      };
    }

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
