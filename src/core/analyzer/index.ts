/**
 * Analyzer 模块公共 API
 *
 * 用法示例：
 * ```typescript
 * import { buildAnalyzerOutput } from '@/core/analyzer';
 *
 * const rawData: RawUserData = { profile, topics, replies, isTopicsHidden };
 * const output = buildAnalyzerOutput(rawData);
 * // output.userOverview - 用户总览
 * // output.summary - 活跃期统计汇总
 * // output.contents - 分片后的内容
 * ```
 */

// 主入口函数
export { buildAnalyzerOutput } from './builder';

// 类型导出
export type {
  // 输入
  RawUserData,
  // 输出
  AnalyzerOutput,
  UserOverview,
  PeriodsSummary,
  SinglePeriodStats,
  PeriodContent,
  PeriodContentChunk,
  ContentTopic,
  ContentReply,
  // 内部（可选导出，供高级用法）
  ActivePeriod,
  PeriodBoundary,
} from './types';
