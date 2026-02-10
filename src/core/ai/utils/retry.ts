/**
 * 重试工具 - 指数退避
 */

import { RETRY_CONFIG } from '../config';

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

/**
 * 带重试逻辑执行函数
 *
 * 使用指数退避 + 随机抖动策略
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = RETRY_CONFIG.maxRetries,
    baseDelay = RETRY_CONFIG.baseDelay,
    maxDelay = RETRY_CONFIG.maxDelay,
  } = options;

  const safeMaxRetries = Math.max(0, maxRetries);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= safeMaxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === safeMaxRetries) {
        break;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = delay * 0.1 * Math.random();
      await sleep(delay + jitter);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
