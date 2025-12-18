import axios from 'axios';
import type { IFetchStrategy, FetchResult, FetchOptions, FetchEvents } from './types';

export class SequentialStrategy implements IFetchStrategy {
  async *fetch(
    urls: string[],
    options?: FetchOptions,
    events?: FetchEvents,
  ): AsyncGenerator<FetchResult> {
    const total = urls.length;

    for (let i = 0; i < total; i++) {
      const url = urls[i]!;

      // 触发开始事件
      events?.onStart?.(url, i, total);

      try {
        const response = await axios.get(url, {
          timeout: 30000, // 默认 30 秒超时
          ...(options?.headers && { headers: options.headers }),
          ...(options?.timeout && { timeout: options.timeout }),
          validateStatus: () => true, // 即使 404/500 也返回，让上层处理
        });

        const result: FetchResult = {
          url,
          content:
            typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
          success: response.status >= 200 && response.status < 300,
          statusCode: response.status,
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
