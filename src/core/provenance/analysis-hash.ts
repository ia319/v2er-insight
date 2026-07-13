import type { AnalyzerOutput } from '@/core/analyzer';
import type { AnalyzerConfig } from '@/config';
import { DEFAULT_CONFIG } from '@/config';
import { hashCanonicalJson } from './canonical-json';

export interface AnalysisFingerprintInput {
  semanticDataHash: string;
  analyzerSchemaVersion: number;
  analysisConfigHash: string;
}

/** Hash only Analyzer settings that change statistical meaning. */
export function computeAnalysisConfigHash(config?: AnalyzerConfig): string {
  return hashCanonicalJson({
    inactivityThreshold: config?.inactivityThreshold ?? DEFAULT_CONFIG.analyzer.inactivityThreshold,
    nodeDistributionTopN:
      config?.nodeDistributionTopN ?? DEFAULT_CONFIG.analyzer.nodeDistributionTopN,
  });
}

/** Combine source semantics, Analyzer schema, and semantic configuration. */
export function computeAnalysisFingerprint(input: AnalysisFingerprintInput): string {
  return hashCanonicalJson([
    input.semanticDataHash,
    input.analyzerSchemaVersion,
    input.analysisConfigHash,
  ]);
}

/** Hash the complete Analyzer payload for provenance and turn diagnostics. */
export function computePayloadHash(output: AnalyzerOutput): string {
  return hashCanonicalJson(output);
}
