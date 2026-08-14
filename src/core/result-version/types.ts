import type { AIAnalysisResult } from '@/core/ai';
import type { AnalyzerOutput } from '@/core/analyzer';

export const RESULT_VERSION_INDEX_SCHEMA_VERSION = 1 as const;
export const STORED_RESULT_VERSION_SCHEMA_VERSION = 1 as const;

export type ResultVersionOrigin = 'analysis' | 'resend' | 'legacy' | 'untracked-current';
export type ResultVersionProvider = 'gemini' | 'codex' | 'unknown';
export type ResultVersionDataQuality = 'complete' | 'partial' | 'unknown';

export interface ResultVersionMetadata {
  versionId: string;
  sequence: number;
  origin: ResultVersionOrigin;
  deliveryId: string | null;
  previousLatestVersionId: string | null;
  previousCurrentHash: string | null;
  createdAt: string | null;
  savedAt: string;
  provider: ResultVersionProvider;
  model: string | null;
  reasoningLevel: string | null;
  localSessionId: string | null;
  externalThreadId: string | null;
  threadName: string | null;
  promptHash: string | null;
  analysisFingerprint: string | null;
  payloadHash: string | null;
  resultHash: string;
  dataQuality: ResultVersionDataQuality;
  warningCount: number | null;
  appVersion: string | null;
}

export interface ResultVersionIndex {
  schemaVersion: typeof RESULT_VERSION_INDEX_SCHEMA_VERSION;
  nextSequence: number;
  latestVersionId: string | null;
  versions: ResultVersionMetadata[];
  updatedAt: string;
}

export interface ResultInputSummary {
  username: string;
  analyzerConfig: {
    inactivityThresholdDays: number;
    nodeDistributionTopN: number;
  };
  dataQuality: AnalyzerOutput['dataQuality'];
  userOverview: AnalyzerOutput['userOverview'];
  activitySummary: AnalyzerOutput['summary'];
}

export interface StoredResultVersion {
  schemaVersion: typeof STORED_RESULT_VERSION_SCHEMA_VERSION;
  metadata: ResultVersionMetadata;
  inputSummary: ResultInputSummary | null;
  inputSummaryHash: string | null;
  result: AIAnalysisResult;
}

export interface ResultVersionSource {
  deliveryId: string;
  origin: Extract<ResultVersionOrigin, 'analysis' | 'resend'>;
  createdAt: string;
  provider: Exclude<ResultVersionProvider, 'unknown'>;
  model: string;
  reasoningLevel: string | null;
  localSessionId: string | null;
  externalThreadId: string | null;
  threadName: string | null;
  promptHash: string;
  analysisFingerprint: string;
  payloadHash: string;
  dataQuality: Exclude<ResultVersionDataQuality, 'unknown'>;
  warningCount: number;
  appVersion: string;
}
