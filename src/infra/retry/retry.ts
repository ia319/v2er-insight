/**
 * 通用重试工具 — 指数退避 + 随机抖动
 *
 * 纯参数驱动，不依赖任何 config 模块。
 * 调用方（AI / Fetcher）负责从 config 读取默认值并传入。
 */

import type { RetryOptions } from './types';

/**
 * 带重试逻辑执行异步函数
 *
 * 使用指数退避（2^attempt * baseDelay）+ 10% 随机抖动策略。
 * 当所有重试耗尽后，抛出最后一次捕获的错误。
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxRetries, baseDelay, maxDelay } = options;

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
