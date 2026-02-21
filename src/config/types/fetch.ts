/**
 * Fetcher 模块配置类型
 */

/** Fetcher 模块配置 */
export interface FetchConfig {
  /** HTTP 请求超时（毫秒） */
  timeout?: number;
  /** HTTP 请求最大重试次数（0 = 不重试） */
  maxRetries?: number;
  /** 重试基础延迟（毫秒） */
  baseDelay?: number;
  /** 重试最大延迟上限（毫秒） */
  maxDelay?: number;
}
