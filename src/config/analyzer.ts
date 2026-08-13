import { DEFAULT_CONFIG } from './defaults';
import type { AnalyzerConfig } from './types/analyzer';

export interface ResolvedSemanticAnalyzerConfig {
  inactivityThreshold: number;
  nodeDistributionTopN: number;
}

/**
 * Resolves Analyzer settings that affect the meaning of persisted statistics.
 * @param config - Optional Analyzer configuration overrides.
 * @returns The semantic settings actually used by Analyzer and provenance.
 */
export function resolveSemanticAnalyzerConfig(
  config?: AnalyzerConfig,
): ResolvedSemanticAnalyzerConfig {
  return {
    inactivityThreshold: config?.inactivityThreshold ?? DEFAULT_CONFIG.analyzer.inactivityThreshold,
    nodeDistributionTopN:
      config?.nodeDistributionTopN ?? DEFAULT_CONFIG.analyzer.nodeDistributionTopN,
  };
}
