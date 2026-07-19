/**
 * 配置模块公共导出
 */

export type { V2erConfig } from './types';
export type {
  AIConfig,
  AIProviderId,
  CodexProviderConfig,
  GeminiProviderConfig,
  ThinkingLevel,
} from './types/ai';
export {
  AI_PROVIDERS,
  CODEX_DEFAULT_MODEL,
  CODEX_DEFAULT_REASONING_EFFORT,
  THINKING_LEVELS,
} from './types/ai';
export type { FetchConfig } from './types/fetch';
export type { AnalyzerConfig } from './types/analyzer';
export type { DataConfig } from './types/data';
export type { LogConfig } from './types/log';
export type { LogLevel } from '@/infra/logger';
export { getConfigDir, getConfigPath } from './path';
export { readConfig, writeConfig, getConfig } from './storage';
export { DEFAULT_CONFIG } from './defaults';
export type { ResolvedGeminiConfig } from './ai';
export { resolveGeminiConfig } from './ai';
export { getProxyUrl, initFetchProxy } from './proxy';
