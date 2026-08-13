import type { AnalyzerOutput } from '@/core/analyzer';
import { resolveSemanticAnalyzerConfig, type AnalyzerConfig } from '@/config';
import { isResultInputSummary } from './validator';
import type { ResultInputSummary } from './types';

/**
 * Projects the stable Analyzer facts that must remain attached to a result version.
 * @param username - Validated command target that owns the analysis.
 * @param output - The same complete Analyzer output sent to the provider.
 * @param config - Analyzer configuration used to produce the output.
 * @returns A detached summary without topic or reply content.
 * @throws {TypeError} When the input cannot satisfy the persisted summary contract.
 */
export function createResultInputSummary(
  username: string,
  output: AnalyzerOutput,
  config?: AnalyzerConfig,
): ResultInputSummary {
  const semanticConfig = resolveSemanticAnalyzerConfig(config);
  const summary: ResultInputSummary = {
    username,
    analyzerConfig: {
      inactivityThresholdDays: semanticConfig.inactivityThreshold,
      nodeDistributionTopN: semanticConfig.nodeDistributionTopN,
    },
    dataQuality: structuredClone(output.dataQuality),
    userOverview: structuredClone(output.userOverview),
    activitySummary: structuredClone(output.summary),
  };

  if (!isResultInputSummary(summary)) {
    throw new TypeError('Result input summary is invalid');
  }
  return summary;
}
