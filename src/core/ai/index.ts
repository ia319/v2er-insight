/**
 * AI 模块入口
 *
 * 提供用户分析功能的统一接口
 */

export type {
  AIAnalysisInput,
  AIAnalysisResult,
  AnalysisOptions,
  IAIProvider,
  SessionOptions,
  ProfessionalProfile,
  PersonalProfile,
  PsychologicalProfile,
  BehavioralProfile,
  SocialProfile,
  RiskAssessment,
} from './types';

export { GeminiProvider } from './providers';

export { parseResponse, type ValidationResult } from './parser';

export { isAIAnalysisResult } from './result-validator';
export type { AIResultParseErrorCode } from './result-parser';
export { AIResultParseError, parseAIAnalysisResult } from './result-parser';
export { AI_ANALYSIS_RESULT_JSON_SCHEMA, type AIResultJsonSchema } from './result-schema';

export { resolveApiKey, withRetry, type RetryOptions } from './utils';

export { buildAnalysisRequest, type AnalysisRequest } from './prompt';
