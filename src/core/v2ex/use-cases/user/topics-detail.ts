/**
 * 用户发帖详情获取服务
 * 获取用户所有发帖的完整内容，支持失败帖二次重试
 */

import { Fetcher, SequentialStrategy } from '@/infra/fetcher';
import type { FetchOptions } from '@/infra/fetcher';
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
 * 第一轮批量抓取所有帖子，收集失败项（HTTP 失败或解析失败）；
 * 第一轮结束后，若存在失败项，发起第二轮重试。
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
  const failedUrls: string[] = [];

  // 第一轮：批量抓取并解析帖子详情
  for await (const result of fetcher.fetch(urlsResult.data, fetchOptions, options?.events)) {
    if (result.success && result.content) {
      try {
        const detail = parseTopicDetail(result.content);
        topics.push(detail);
        fetchedTopics++;
      } catch {
        // 解析失败，记录 URL 用于二次重试
        failedUrls.push(result.url);
      }
    } else {
      failedUrls.push(result.url);
    }
  }

  // 第二轮：对失败帖发起重试
  if (failedUrls.length > 0) {
    for await (const result of fetcher.fetch(failedUrls, fetchOptions, options?.events)) {
      if (result.success && result.content) {
        try {
          const detail = parseTopicDetail(result.content);
          topics.push(detail);
          fetchedTopics++;
          // 从失败列表中移除已恢复的项
          const idx = failedUrls.indexOf(result.url);
          if (idx !== -1) failedUrls.splice(idx, 1);
        } catch {
          // 二次重试解析仍失败，保留在 failedUrls 中
        }
      }
      // HTTP 失败保留在 failedUrls 中
    }
  }

  return {
    topics,
    totalTopics: urlsResult.data.length,
    fetchedTopics,
    failedTopics: failedUrls.length,
    isHidden: false,
  };
}
