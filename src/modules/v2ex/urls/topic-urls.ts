/**
 * 帖子相关 URL 生成器
 */

import { V2EX_BASE } from './constants';

/**
 * 生成单个帖子页面 URL
 * @param topicId - 帖子 ID
 * @returns 完整 URL，如 https://www.v2ex.com/t/1180072
 */
export function getTopicUrl(topicId: string | number): string {
  return `${V2EX_BASE}/t/${topicId}`;
}

/**
 * 从帖子相对路径提取帖子 ID
 * @param path - 相对路径，如 /t/1180072 或 /t/1180072#reply1
 * @returns 帖子 ID，如 1180072
 */
export function extractTopicIdFromPath(path: string): string | null {
  const match = path.match(/\/t\/(\d+)/);
  return match?.[1] ?? null;
}
