/**
 * Fetcher 模块类型定义
 */

/** 请求配置选项 */
export interface FetchOptions {
  headers?: Record<string, string>;
  timeout?: number;
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
}

/** 抓取策略接口 */
export interface IFetchStrategy {
  fetch(urls: string[], options?: FetchOptions, events?: FetchEvents): AsyncGenerator<FetchResult>;
}
