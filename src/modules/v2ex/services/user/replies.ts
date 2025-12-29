/**
 * 用户回复数据获取服务
 */

import { getUserRepliesUrl } from '../../urls';
import { parseRepliesPage } from '../../parsers';
import type { V2exReply } from '../../types';
import type { PagedResult, ServiceOptions } from '../types';
import { fetchPagedData } from '../utils';

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
): Promise<PagedResult<V2exReply>> {
  return fetchPagedData(
    (page) => getUserRepliesUrl(username, page),
    parseRepliesPage,
    (result) => result.replies,
    options,
  );
}
