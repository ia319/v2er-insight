/**
 * 用户发帖详情获取服务
 * 获取用户所有发帖的完整内容
 */

import { Fetcher, SequentialStrategy } from '../../../fetcher';
import type { FetchOptions } from '../../../fetcher';
import { parseTopicDetail } from '../../parsers';
import type { TopicDetailParseResult } from '../../types';
import type { ServiceOptions } from '../types';
import { getAllUserTopicUrls } from './topic-urls';

/**
 * 用户发帖详情获取结果
 */
export interface UserTopicsDetailResult {
  /** 所有帖子详情列表 */
  topics: TopicDetailParseResult[];
  /** 帖子总数（URL 数量） */
  totalTopics: number;
  /** 成功获取详情的帖子数 */
  fetchedTopics: number;
  /** 获取失败的帖子数 */
  failedTopics: number;
  /** 用户是否隐藏了主题列表 */
  isHidden: boolean;
}

/**
 * 获取用户所有发帖的完整详情
 *
 * @param username - 用户名
 * @param options - 服务配置选项
 * @returns 包含所有帖子详情的结果
 */
export async function getAllUserTopicsDetail(
  username: string,
  options?: ServiceOptions,
): Promise<UserTopicsDetailResult> {
  // 获取用户所有帖子完整 URL
  const urlsResult = await getAllUserTopicUrls(username, options);

  if (urlsResult.isHidden || urlsResult.data.length === 0) {
    return {
      topics: [],
      totalTopics: 0,
      fetchedTopics: 0,
      failedTopics: 0,
      isHidden: urlsResult.isHidden,
    };
  }

  const fetcher = new Fetcher(new SequentialStrategy());
  const fetchOptions: FetchOptions = {
    timeout: options?.timeout,
    headers: options?.headers,
  };

  const topics: TopicDetailParseResult[] = [];
  let fetchedTopics = 0;
  let failedTopics = 0;

  // 批量抓取并解析帖子详情
  for await (const result of fetcher.fetch(urlsResult.data, fetchOptions, options?.events)) {
    if (result.success && result.content) {
      try {
        const detail = parseTopicDetail(result.content);
        topics.push(detail);
        fetchedTopics++;
      } catch {
        failedTopics++;
      }
    } else {
      failedTopics++;
    }
  }

  return {
    topics,
    totalTopics: urlsResult.data.length,
    fetchedTopics,
    failedTopics,
    isHidden: false,
  };
}
