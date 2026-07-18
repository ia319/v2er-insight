/**
 * 用户发帖详情获取服务
 * 获取用户所有发帖的完整内容，支持失败帖二次重试
 */

import { Fetcher, SequentialStrategy } from '@/infra/fetcher';
import type { FetchOptions } from '@/infra/fetcher';
import { parseTopicDetail } from '../../parsers';
import type { V2exTopicDetail } from '../../types';
import { extractTopicIdFromPath, getTopicUrl } from '../../urls';
import type { ServiceOptions } from '../types';
import { getAllUserTopicUrls } from './topic-urls';

/**
 * 用户发帖详情获取结果
 */
export interface UserTopicsDetailResult {
  /** 所有帖子详情列表 */
  topics: V2exTopicDetail[];
  /** 帖子总数（URL 数量） */
  totalTopics: number;
  /** 成功获取详情的帖子数 */
  fetchedTopics: number;
  /** 获取失败的帖子数 */
  failedTopics: number;
  /** Number of topic list pages that could not be fetched. */
  failedPages: number;
  /** Stable topic identity parse-failure count. */
  invalidTopicCount: number;
  /** 用户是否隐藏了主题列表 */
  isHidden: boolean;
}

/**
 * Parses topic content and attaches the stable identity from its source URL.
 *
 * @param sourceUrl - URL returned by the topic list use case.
 * @param html - Topic page HTML.
 * @returns An identified topic; `null` represents an unresolved stable identity.
 */
function parseIdentifiedTopic(sourceUrl: string, html: string): V2exTopicDetail | null {
  const topicId = extractTopicIdFromPath(sourceUrl);
  if (!topicId) {
    return null;
  }

  return {
    topicId,
    sourceUrl: getTopicUrl(topicId),
    ...parseTopicDetail(html),
  };
}

/**
 * Parser failures remain isolated within the batch.
 *
 * @param topicsById - Successfully parsed topics keyed by stable identity.
 * @param sourceUrl - URL returned by the topic list use case.
 * @param html - Topic page HTML.
 * @returns Whether the topic was parsed and retained.
 */
function tryStoreIdentifiedTopic(
  topicsById: Map<string, V2exTopicDetail>,
  sourceUrl: string,
  html: string,
): boolean {
  try {
    const topic = parseIdentifiedTopic(sourceUrl, html);
    if (!topic) {
      return false;
    }

    topicsById.set(topic.topicId, topic);
    return true;
  } catch {
    return false;
  }
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
  const totalTopics =
    urlsResult.data.length + urlsResult.invalidTopicCount + urlsResult.discardedTopicCount;

  if (urlsResult.isHidden || urlsResult.data.length === 0) {
    return {
      topics: [],
      totalTopics,
      fetchedTopics: 0,
      failedTopics: urlsResult.invalidTopicCount + urlsResult.discardedTopicCount,
      failedPages: urlsResult.failedPages,
      invalidTopicCount: urlsResult.invalidTopicCount,
      isHidden: urlsResult.isHidden,
    };
  }

  const fetcher = new Fetcher(new SequentialStrategy());
  const fetchOptions: FetchOptions = {
    timeout: options?.timeout,
    headers: options?.headers,
  };

  const topicsById = new Map<string, V2exTopicDetail>();
  const failedUrls: string[] = [];

  // 第一轮：批量抓取并解析帖子详情
  for await (const result of fetcher.fetch(urlsResult.data, fetchOptions, options?.events)) {
    if (
      !result.success ||
      !result.content ||
      !tryStoreIdentifiedTopic(topicsById, result.url, result.content)
    ) {
      failedUrls.push(result.url);
    }
  }

  // 第二轮：对失败帖发起重试
  if (failedUrls.length > 0) {
    const recoveredUrls = new Set<string>();
    for await (const result of fetcher.fetch(failedUrls, fetchOptions, options?.events)) {
      if (
        result.success &&
        result.content &&
        tryStoreIdentifiedTopic(topicsById, result.url, result.content)
      ) {
        recoveredUrls.add(result.url);
      }
    }
    // 最终失败数 = 原失败列表 - 已恢复
    const stillFailed = failedUrls.filter((url) => !recoveredUrls.has(url));
    return {
      topics: Array.from(topicsById.values()),
      totalTopics,
      fetchedTopics: topicsById.size,
      failedTopics: stillFailed.length + urlsResult.invalidTopicCount,
      failedPages: urlsResult.failedPages,
      invalidTopicCount: urlsResult.invalidTopicCount,
      isHidden: false,
    };
  }

  return {
    topics: Array.from(topicsById.values()),
    totalTopics,
    fetchedTopics: topicsById.size,
    failedTopics: failedUrls.length + urlsResult.invalidTopicCount,
    failedPages: urlsResult.failedPages,
    invalidTopicCount: urlsResult.invalidTopicCount,
    isHidden: false,
  };
}
