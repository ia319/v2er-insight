/**
 * Fetcher 模块类型定义
 */

/** 请求配置选项 */
export interface FetchOptions {
  headers?: Record<string, string>;
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试基础延迟（毫秒） */
  baseDelay?: number;
  /** 重试最大延迟上限（毫秒） */
  maxDelay?: number;
}

/** 抓取结果 */
export interface FetchResult {
  url: string;
  content: string | null;
  success: boolean;
  error?: Error;
  statusCode?: number;
  /** 非 2xx 响应时的响应体 */
  errorBody?: string;
}

/** 抓取事件回调 */
export interface FetchEvents {
  onStart?: (url: string, index: number, total: number) => void;
  onSuccess?: (result: FetchResult, index: number, total: number) => void;
  onError?: (result: FetchResult, index: number, total: number) => void;
  /** 重试时触发 */
  onRetry?: (
    url: string,
    attempt: number,
    maxRetries: number,
    delay: number,
    reason: string,
  ) => void;
}

/** 抓取策略接口 */
export interface IFetchStrategy {
  fetch(urls: string[], options?: FetchOptions, events?: FetchEvents): AsyncGenerator<FetchResult>;
}
