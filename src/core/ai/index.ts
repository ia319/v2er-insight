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
  ProfessionalProfile,
  PersonalProfile,
  PsychologicalProfile,
  BehavioralProfile,
  SocialProfile,
  RiskAssessment,
} from './types';

export { GeminiProvider } from './providers';

export { parseResponse, type ValidationResult } from './parser';

export { resolveApiKey, withRetry, type RetryOptions } from './utils';

export { DEFAULT_MODEL, DEFAULT_TIMEOUT, RETRY_CONFIG } from './config';

export { buildMessageSequence, type MessageSequence } from './prompt';
