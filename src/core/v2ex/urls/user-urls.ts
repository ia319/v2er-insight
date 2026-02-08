/**
 * 用户相关 URL 生成器
 */

import { V2EX_BASE } from './constants';

/**
 * 生成用户主页 URL
 * @param username - 用户名
 * @returns 完整 URL，如 https://www.v2ex.com/member/<username>
 */
export function getUserProfileUrl(username: string): string {
  return `${V2EX_BASE}/member/${username}`;
}

/**
 * 生成用户回复列表页 URL
 * @param username - 用户名
 * @param page - 页码，默认为 1
 * @returns 完整 URL，如 https://www.v2ex.com/member/<username>/replies?p=1
 */
export function getUserRepliesUrl(username: string, page: number = 1): string {
  return `${V2EX_BASE}/member/${username}/replies?p=${page}`;
}

/**
 * 生成用户发帖列表页 URL
 * @param username - 用户名
 * @param page - 页码，默认为 1
 * @returns 完整 URL，如 https://www.v2ex.com/member/<username>/topics?p=1
 */
export function getUserTopicsUrl(username: string, page: number = 1): string {
  return `${V2EX_BASE}/member/${username}/topics?p=${page}`;
}
