/**
 * AI 模块配置
 */

export const DEFAULT_MODEL = 'gemini-3-pro-preview';
export const DEFAULT_TIMEOUT = 60_000;

export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
};
