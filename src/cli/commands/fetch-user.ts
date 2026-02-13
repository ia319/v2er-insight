/**
 * fetch-user 命令
 */

import { getUserProfile, getAllUserReplies, getAllUserTopicUrls } from '@/core/v2ex';
import type { UserTopicUrlsResult, PagedResult, V2exReply } from '@/core/v2ex';
import type { FetchResult, FetchEvents } from '@/infra/fetcher';
import { logger } from '@/infra/logger';
import type { FetchUserOptions } from '../types';
import { logFetchError } from '../utils';

/**
 * 创建抓取事件回调
 */
function createFetchEvents(label: string): FetchEvents {
  return {
    onStart: (_url: string, index: number, total: number) => {
      logger.progress(index, total, label);
    },
    onError: (result: FetchResult) => {
      logFetchError(result);
    },
  };
}

/**
 * 打印抓取摘要
 */
function printSummary(
  profileOk: boolean,
  topicUrls: UserTopicUrlsResult | null,
  replies: PagedResult<V2exReply> | null,
): void {
  logger.info('\n=== Summary ===');
  logger.info(`Profile: ${profileOk ? 'OK' : 'Failed'}`);

  if (topicUrls) {
    if (topicUrls.isHidden) {
      logger.info('Topics: Hidden');
    } else {
      const failed = topicUrls.failedPages > 0 ? ` (${topicUrls.failedPages} failed)` : '';
      logger.info(`Topics: ${topicUrls.data.length}${failed}`);
    }
  }

  if (replies) {
    const failed = replies.failedPages > 0 ? ` (${replies.failedPages} failed)` : '';
    logger.info(`Replies: ${replies.data.length}${failed}`);
  }

  logger.info('');
}

/**
 * 执行 fetch-user 命令
 */
export async function fetchUser(username: string, options: FetchUserOptions): Promise<void> {
  logger.info(`\nFetching data for user: ${username}`);

  const fetchTopics = options.topics || (!options.topics && !options.replies);
  const fetchReplies = options.replies || (!options.topics && !options.replies);

  let profileOk = false;
  let topicUrls: UserTopicUrlsResult | null = null;
  let replies: PagedResult<V2exReply> | null = null;

  // 获取用户资料
  logger.section('Fetching profile...');
  const profile = await getUserProfile(username, {
    events: createFetchEvents('Fetching profile'),
  });

  if (profile) {
    profileOk = true;
    logger.success(`Joined ${profile.joinDate}`);
    if (profile.dailyRanking) {
      logger.detail(`Daily Ranking: #${profile.dailyRanking}`);
    }
  } else {
    logger.error('Failed to fetch profile');
  }

  // 获取话题 URL
  if (fetchTopics) {
    logger.section('Fetching topic URLs...');
    topicUrls = await getAllUserTopicUrls(username, {
      events: createFetchEvents('Fetching page'),
    });

    if (topicUrls.isHidden) {
      logger.detail('Topics are hidden by user');
    } else {
      logger.success(`${topicUrls.data.length} topic URLs`);
      if (topicUrls.failedPages > 0) {
        logger.detail(`(${topicUrls.failedPages} pages failed)`);
      }
    }
  }

  // 获取回复
  if (fetchReplies) {
    logger.section('Fetching replies...');
    replies = await getAllUserReplies(username, {
      events: createFetchEvents('Fetching page'),
    });

    logger.success(`${replies.data.length} replies`);
    if (replies.failedPages > 0) {
      logger.detail(`(${replies.failedPages} pages failed)`);
    }
  }

  printSummary(profileOk, topicUrls, replies);
}
