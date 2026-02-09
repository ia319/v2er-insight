/**
 * Analysis Options
 */

import type { AnalyzerOutput } from '@/core/analyzer';

/** AI analysis input = Analyzer output */
export type AIAnalysisInput = AnalyzerOutput;

/** Analysis options */
export interface AnalysisOptions {
  apiKey?: string;
  model?: string;
  timeout?: number;
}
