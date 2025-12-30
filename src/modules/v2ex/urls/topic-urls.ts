/**
 * 帖子相关 URL 生成器
 */

import { V2EX_BASE } from './constants';

/**
 * 生成单个帖子页面 URL
 * 支持帖子 ID 或相对路径作为输入
 *
 * @param topicIdOrPath - 帖子 ID（如 123456）或相对路径（如 /t/123456）
 * @returns 完整 URL，如 https://www.v2ex.com/t/123456
 * @throws 当输入的路径格式无效时（包含 /t/ 但无法提取有效 ID）
 */
export function getTopicUrl(topicIdOrPath: string | number): string {
  // 数字直接使用
  if (typeof topicIdOrPath === 'number') {
    return `${V2EX_BASE}/t/${topicIdOrPath}`;
  }

  // 路径格式（包含 /t/），提取 ID
  if (topicIdOrPath.includes('/t/')) {
    const topicId = extractTopicIdFromPath(topicIdOrPath);
    if (topicId) {
      return `${V2EX_BASE}/t/${topicId}`;
    }
    // 包含 /t/ 但提取失败，抛出错误使问题更早暴露
    throw new Error(`Invalid topic path: cannot extract topic ID from "${topicIdOrPath}"`);
  }

  // 纯 ID 字符串
  return `${V2EX_BASE}/t/${topicIdOrPath}`;
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
