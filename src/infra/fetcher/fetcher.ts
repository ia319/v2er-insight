import axios from 'axios';
import type { IFetchStrategy, FetchResult, FetchOptions, FetchEvents } from './types';
import { getHttpsAgent } from './agent';
import { getConfig } from '@/config';

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

export class SequentialStrategy implements IFetchStrategy {
  async *fetch(
    urls: string[],
    options?: FetchOptions,
    events?: FetchEvents,
  ): AsyncGenerator<FetchResult> {
    const total = urls.length;
    const httpsAgent = getHttpsAgent();

    for (let i = 0; i < total; i++) {
      const url = urls[i]!;

      // 触发开始事件
      events?.onStart?.(url, i, total);

      try {
        const response = await axios.get(url, {
          timeout: options?.timeout ?? getConfig().fetch?.timeout ?? 30_000,
          ...(options?.headers && { headers: options.headers }),
          ...(httpsAgent && { httpsAgent }),
          proxy: false,
          validateStatus: () => true,
        });

        const isSuccess = response.status >= 200 && response.status < 300;
        const responseBody = responseToString(response.data);

        const result: FetchResult = {
          url,
          content: isSuccess ? responseBody : null,
          success: isSuccess,
          statusCode: response.status,
          ...(isSuccess ? {} : { errorBody: responseBody }),
        };

        // 触发成功/失败事件
        if (result.success) {
          events?.onSuccess?.(result, i, total);
        } else {
          events?.onError?.(result, i, total);
        }

        yield result;
      } catch (error) {
        const result: FetchResult = {
          url,
          content: null,
          success: false,
          error: error as Error,
        };

        events?.onError?.(result, i, total);
        yield result;
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
