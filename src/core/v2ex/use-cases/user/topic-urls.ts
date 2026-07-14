/**
 * 用户发帖 URL 列表获取服务
 */

import { getUserTopicsUrl, getTopicUrl } from '../../urls';
import { parseTopicsListPage } from '../../parsers';
import type { PagedResult, ServiceOptions } from '../types';
import { fetchPagedData } from '../utils';

/**
 * 用户发帖 URL 获取结果
 * 扩展 PagedResult，增加隐藏状态标识
 */
export interface UserTopicUrlsResult extends PagedResult<string> {
  /** 用户是否隐藏了主题列表 */
  isHidden: boolean;
  /** Number of links without a stable topic ID. */
  invalidTopicCount: number;
  /** Number of collected topic URLs discarded after the list became hidden. */
  discardedTopicCount: number;
}

/**
 * 获取用户所有发帖完整 URL
 *
 * @param username - 用户名
 * @param options - 服务配置选项
 * @returns 包含所有发帖完整 URL 的结果
 */
export async function getAllUserTopicUrls(
  username: string,
  options?: ServiceOptions,
): Promise<UserTopicUrlsResult> {
  let isHidden = false;
  let invalidTopicCount = 0;

  const result = await fetchPagedData(
    (page) => getUserTopicsUrl(username, page),
    (html) => {
      const parsed = parseTopicsListPage(html);
      isHidden ||= parsed.isHidden;
      invalidTopicCount += parsed.invalidTopicCount;
      return parsed;
    },
    (parsed) => parsed.topicUrls,
    options,
  );

  // 将相对路径转换为完整 URL
  const fullUrls = result.data.map((path) => getTopicUrl(path));
  const discardedTopicCount = isHidden ? fullUrls.length : 0;

  return {
    ...result,
    data: isHidden ? [] : fullUrls,
    isHidden,
    invalidTopicCount,
    discardedTopicCount,
  };
}
