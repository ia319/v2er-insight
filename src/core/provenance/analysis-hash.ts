import type { AnalyzerOutput } from '@/core/analyzer';
import type { AnalyzerConfig } from '@/config';
import { resolveSemanticAnalyzerConfig } from '@/config';
import { hashCanonicalJson } from './canonical-json';

export interface AnalysisFingerprintInput {
  semanticDataHash: string;
  analyzerSchemaVersion: number;
  analysisConfigHash: string;
}

/** Hashes Analyzer settings that define statistical meaning. */
export function computeAnalysisConfigHash(config?: AnalyzerConfig): string {
  return hashCanonicalJson(resolveSemanticAnalyzerConfig(config));
}

/** Combines source semantics, Analyzer schema, and semantic configuration. */
export function computeAnalysisFingerprint(input: AnalysisFingerprintInput): string {
  return hashCanonicalJson([
    input.semanticDataHash,
    input.analyzerSchemaVersion,
    input.analysisConfigHash,
  ]);
}

/** Hashes the complete Analyzer payload for provenance and turn diagnostics. */
export function computePayloadHash(output: AnalyzerOutput): string {
  return hashCanonicalJson(output);
}
