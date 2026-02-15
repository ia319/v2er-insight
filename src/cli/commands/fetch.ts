/**
 * fetch 命令 — 抓取 V2EX 用户数据并持久化
 *
 * 调用 V2EX use-cases 获取 profile + topics detail + replies，
 * 组装为 RawUserData 结构后写入 raw.json。
 */

import { getUserProfile, getAllUserReplies, getAllUserTopicsDetail } from '@/core/v2ex';
import type {
  UserProfileParseResult,
  UserTopicsDetailResult,
  PagedResult,
  V2exReply,
} from '@/core/v2ex';
import type { RawUserData } from '@/core/analyzer';
import { readDataFile, writeDataFile } from '@/infra/storage';
import { logger } from '@/infra/logger';
import { getRecoveryActions } from '../workflow/recovery';
import type { StepRunResult } from '../workflow/types';
import type { FetchCommandOptions } from '../types';
import { createFetchEvents } from '../utils';

// -- 内部工具 ----------------------------------------------------------------

/**
 * 打印抓取摘要
 */
function printSummary(
  profileOk: boolean,
  topicsResult: UserTopicsDetailResult | null,
  replies: PagedResult<V2exReply> | null,
): void {
  logger.section('=== 抓取摘要 ===');
  logger.detail(`Profile: ${profileOk ? 'OK' : 'Failed'}`);

  if (topicsResult) {
    if (topicsResult.isHidden) {
      logger.detail('Topics: Hidden');
    } else {
      const failed = topicsResult.failedTopics > 0 ? ` (${topicsResult.failedTopics} failed)` : '';
      logger.detail(`Topics: ${topicsResult.fetchedTopics}/${topicsResult.totalTopics}${failed}`);
    }
  }

  if (replies) {
    const failed = replies.failedPages > 0 ? ` (${replies.failedPages} failed)` : '';
    logger.detail(`Replies: ${replies.data.length}${failed}`);
  }
}

// -- 命令入口 ----------------------------------------------------------------

/**
 * 执行 fetch 命令
 */
export async function runFetch(
  username: string,
  options: FetchCommandOptions,
): Promise<StepRunResult> {
  // 缓存检查
  if (!options.force) {
    const existing = readDataFile(username, 'raw');
    if (existing) {
      logger.info(`已存在 ${username} 的抓取数据，使用 --force 强制重新抓取`);
      return {
        step: 'fetch',
        status: 'skipped',
        message: 'raw.json 已存在，跳过抓取',
      };
    }
  }

  logger.info(`\n抓取用户数据: ${username}`);

  // 默认两者都抓取，除非显式指定了其中之一
  const fetchTopics = options.topics || !options.replies;
  const fetchReplies = options.replies || !options.topics;

  let profile: UserProfileParseResult | null = null;
  let topicsResult: UserTopicsDetailResult | null = null;
  let replies: PagedResult<V2exReply> | null = null;

  // 1. 获取用户资料
  logger.section('获取用户资料...');
  profile = await getUserProfile(username, {
    events: createFetchEvents('获取资料'),
  });

  if (profile) {
    logger.success(`注册于 ${profile.joinDate}`);
    if (profile.dailyRanking) {
      logger.detail(`活跃排名: #${profile.dailyRanking}`);
    }
  } else {
    logger.error('获取用户资料失败');
    return {
      step: 'fetch',
      status: 'failed',
      reasonCode: 'FETCH_PROFILE_FAILED',
      message: '获取用户资料失败',
      recoverable: true,
      recoverActions: getRecoveryActions('FETCH_PROFILE_FAILED', { username }),
    };
  }

  // 2. 获取帖子详情
  if (fetchTopics) {
    logger.section('获取帖子详情...');
    topicsResult = await getAllUserTopicsDetail(username, {
      events: createFetchEvents('获取帖子'),
    });

    if (topicsResult.isHidden) {
      logger.detail('帖子列表被用户隐藏');
    } else {
      logger.success(`${topicsResult.fetchedTopics} 篇帖子`);
      if (topicsResult.failedTopics > 0) {
        logger.detail(`(${topicsResult.failedTopics} 篇获取失败)`);
      }
    }
  }

  // 3. 获取回复
  if (fetchReplies) {
    logger.section('获取回复...');
    replies = await getAllUserReplies(username, {
      events: createFetchEvents('获取回复'),
    });

    logger.success(`${replies.data.length} 条回复`);
    if (replies.failedPages > 0) {
      logger.detail(`(${replies.failedPages} 页获取失败)`);
    }
  }

  // 4. 组装 RawUserData 并持久化
  const rawData: RawUserData = {
    profile,
    topics: topicsResult?.topics ?? [],
    replies: replies?.data ?? [],
    isTopicsHidden: topicsResult?.isHidden ?? false,
  };

  writeDataFile(username, 'raw', rawData);

  if (!options.pipeline) {
    logger.success('数据已保存');
    printSummary(!!profile, topicsResult, replies);
  }

  const failedTopics = topicsResult?.failedTopics ?? 0;
  const failedPages = replies?.failedPages ?? 0;
  const isPartial = failedTopics > 0 || failedPages > 0;

  if (isPartial) {
    return {
      step: 'fetch',
      status: 'partial',
      reasonCode: 'FETCH_PARTIAL_FAILED',
      message: '抓取已完成，但存在部分页面失败',
      recoverable: true,
      recoverActions: getRecoveryActions('FETCH_PARTIAL_FAILED', { username }),
      meta: {
        failedTopics,
        failedPages,
        // TODO(ia319): 在实现 --retry 后补充真实失败页索引 [2026-02-14]
        failedPageIndices: [] as number[],
      },
    };
  }

  return {
    step: 'fetch',
    status: 'success',
    message: '抓取完成',
    meta: {
      fetchedTopics: topicsResult?.fetchedTopics ?? 0,
      fetchedReplies: replies?.data.length ?? 0,
    },
  };
}
