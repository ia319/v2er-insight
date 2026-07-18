/**
 * 用户回复数据获取服务
 */

import { getUserRepliesUrl } from '../../urls';
import { parseRepliesPage } from '../../parsers';
import type { V2exReply } from '../../types';
import type { PagedResult, ServiceOptions } from '../types';
import { fetchPagedData } from '../utils';

/** Reply collection with item-level completeness metadata. */
export interface UserRepliesResult extends PagedResult<V2exReply> {
  totalReplies: number | null;
  /** Number of replies with incomplete topic link metadata. */
  invalidReplyCount: number;
}

/**
 * 获取用户所有回复
 *
 * @param username - 用户名
 * @param options - 服务配置选项
 * @returns 包含所有回复的分页结果
 */
export async function getAllUserReplies(
  username: string,
  options?: ServiceOptions,
): Promise<UserRepliesResult> {
  let totalReplies: number | null = null;
  let invalidReplyCount = 0;

  const result = await fetchPagedData(
    (page) => getUserRepliesUrl(username, page),
    (html) => {
      const parsed = parseRepliesPage(html);
      if (parsed.totalReplies !== null) {
        totalReplies = Math.max(totalReplies ?? 0, parsed.totalReplies);
      }
      invalidReplyCount += parsed.invalidReplyCount;
      return parsed;
    },
    (result) => result.replies,
    options,
  );

  return {
    ...result,
    totalReplies,
    invalidReplyCount,
  };
}
