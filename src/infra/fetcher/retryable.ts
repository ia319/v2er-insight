/**
 * HTTP 请求重试判定
 *
 * 根据响应状态码判断是否值得重试。
 * 仅网络错误和服务端瞬态故障可重试，客户端错误（4xx）不重试。
 */

import type { FetchResult } from './types';

/**
 * 判断请求结果是否可重试
 *
 * - 无状态码（网络错误、超时等）→ 可重试
 * - 429 Too Many Requests → 可重试
 * - 5xx 服务端错误 → 可重试
 * - 其余（含 4xx 客户端错误）→ 不可重试
 */
export function isRetryable(result: FetchResult): boolean {
  if (!result.statusCode) return true;
  if (result.statusCode === 429) return true;
  if (result.statusCode >= 500) return true;
  return false;
}

/**
 * 从响应头解析 Retry-After 值（秒）
 *
 * @returns 延迟秒数，无法解析时返回 null
 */
export function parseRetryAfter(headers?: Record<string, string>): number | null {
  if (!headers) return null;

  // header 名称不区分大小写
  const value = headers['retry-after'] ?? headers['Retry-After'];
  if (!value) return null;

  const seconds = Number(value);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds;
  }

  return null;
}
