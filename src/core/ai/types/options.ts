/**
 * 分析选项
 */

import type { AnalyzerOutput } from '@/core/analyzer';

/** AI 分析输入 = Analyzer 输出 */
export type AIAnalysisInput = AnalyzerOutput;

/** 分析配置选项 */
export interface AnalysisOptions {
  apiKey?: string;
  model?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
}
