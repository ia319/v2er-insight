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
  const result = await fetchPagedData(
    (page) => getUserTopicsUrl(username, page),
    parseTopicsListPage,
    (parsed) => parsed.topicUrls,
    options,
  );

  // 将相对路径转换为完整 URL
  const fullUrls = result.data.map((path) => getTopicUrl(path));

  // 检测隐藏状态：空数据且单页可能是隐藏
  const isHidden = result.data.length === 0 && result.totalPages === 1;

  return {
    ...result,
    data: fullUrls,
    isHidden,
  };
}
