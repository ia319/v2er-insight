/**
 * Fetcher — HTTP 请求执行器
 *
 * 支持传输级自动重试：对网络错误、5xx、429 使用指数退避重试。
 * 4xx 等客户端错误不重试，直接返回失败结果。
 */

import axios from 'axios';
import type { AxiosResponse } from 'axios';
import type { IFetchStrategy, FetchResult, FetchOptions, FetchEvents } from './types';
import { getHttpsAgent } from './agent';
import { getConfig } from '@/config';
import { DEFAULT_CONFIG } from '@/config/defaults';
import { isRetryable, parseRetryAfter } from './retryable';

/**
 * 将响应数据转换为字符串
 */
function responseToString(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/**
 * 计算指数退避延迟 + 随机抖动
 */
function getRetryDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = delay * 0.1 * Math.random();
  return delay + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 将 axios 响应转换为 FetchResult
 */
function toFetchResult(url: string, response: AxiosResponse): FetchResult {
  const isSuccess = response.status >= 200 && response.status < 300;
  const responseBody = responseToString(response.data);

  return {
    url,
    content: isSuccess ? responseBody : null,
    success: isSuccess,
    statusCode: response.status,
    ...(isSuccess ? {} : { errorBody: responseBody }),
  };
}

export class SequentialStrategy implements IFetchStrategy {
  async *fetch(
    urls: string[],
    options?: FetchOptions,
    events?: FetchEvents,
  ): AsyncGenerator<FetchResult> {
    const total = urls.length;
    const httpsAgent = getHttpsAgent();
    const fetchConfig = getConfig().fetch;

    const maxRetries = Math.max(
      0,
      options?.maxRetries ?? fetchConfig?.maxRetries ?? DEFAULT_CONFIG.fetch.maxRetries,
    );
    const baseDelay =
      options?.baseDelay ?? fetchConfig?.baseDelay ?? DEFAULT_CONFIG.fetch.baseDelay;
    const maxDelay = options?.maxDelay ?? fetchConfig?.maxDelay ?? DEFAULT_CONFIG.fetch.maxDelay;

    for (let i = 0; i < total; i++) {
      const url = urls[i]!;

      events?.onStart?.(url, i, total);

      let lastResult: FetchResult | null = null;
      let yielded = false;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await axios.get(url, {
            timeout: options?.timeout ?? fetchConfig?.timeout ?? DEFAULT_CONFIG.fetch.timeout,
            ...(options?.headers && { headers: options.headers }),
            ...(httpsAgent && { httpsAgent }),
            proxy: false,
            validateStatus: () => true,
          });

          const result = toFetchResult(url, response);

          // 成功 或 不可重试的错误 → 直接返回
          if (result.success || !isRetryable(result)) {
            if (result.success) {
              events?.onSuccess?.(result, i, total);
            } else {
              events?.onError?.(result, i, total);
            }
            yield result;
            yielded = true;
            break;
          }

          // 可重试的失败，记录并准备重试
          lastResult = result;

          if (attempt < maxRetries) {
            // 429 时优先使用 Retry-After 值
            const retryAfterSeconds =
              result.statusCode === 429
                ? parseRetryAfter(response.headers as Record<string, string>)
                : null;
            const delay =
              retryAfterSeconds !== null
                ? Math.min(retryAfterSeconds * 1000, maxDelay)
                : getRetryDelay(attempt, baseDelay, maxDelay);

            const reason = result.statusCode ? `HTTP ${result.statusCode}` : 'unknown';
            events?.onRetry?.(url, attempt + 1, maxRetries, delay, reason);
            await sleep(delay);
          }
        } catch (error) {
          // 网络错误（超时、连接重置等）→ 可重试
          lastResult = {
            url,
            content: null,
            success: false,
            error: error as Error,
          };

          if (attempt < maxRetries) {
            const delay = getRetryDelay(attempt, baseDelay, maxDelay);
            const reason = (error as Error).message ?? 'network error';
            events?.onRetry?.(url, attempt + 1, maxRetries, delay, reason);
            await sleep(delay);
          }
        }
      }

      // 所有重试耗尽，yield 最后一次失败结果
      if (!yielded && lastResult) {
        events?.onError?.(lastResult, i, total);
        yield lastResult;
      }
    }
  }
}

export class Fetcher {
  constructor(private strategy: IFetchStrategy) {}

  async *fetch(
    urls: string[],
    options?: FetchOptions,
    events?: FetchEvents,
  ): AsyncGenerator<FetchResult> {
    yield* this.strategy.fetch(urls, options, events);
  }
}
