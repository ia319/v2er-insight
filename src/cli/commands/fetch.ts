/**
 * Fetch V2EX user data and persist a versioned raw snapshot.
 *
 * Collect profile, topic, and reply results through V2EX use cases, then
 * preserve their data and completeness metadata in raw.json.
 */

import { getUserProfile, getAllUserReplies, getAllUserTopicsDetail } from '@/core/v2ex';
import type { UserTopicsDetailResult, UserRepliesResult } from '@/core/v2ex';
import { buildRawSnapshot } from '@/core/snapshot';
import type { RawSnapshotV2, SnapshotCollection, SnapshotRequest } from '@/core/snapshot';
import { readDataFile, writeDataFile } from '@/infra/storage';
import { logger } from '@/infra/logger';
import { getRecoveryActions } from '../workflow/recovery';
import type { StepRunResult } from '../workflow/types';
import type { FetchCommandOptions } from '../types';
import { createFetchEvents } from '../utils';

// -- 内部工具 ----------------------------------------------------------------

function formatCollectionCount(collection: SnapshotCollection<unknown>): string {
  return `${collection.fetchedCount}/${collection.totalExpected ?? '?'}`;
}

function printSummary(snapshot: RawSnapshotV2): void {
  logger.section('=== 抓取摘要 ===');
  logger.detail('Profile: OK');

  if (snapshot.topics.status === 'not_requested') {
    logger.detail('Topics: Not requested');
  } else if (snapshot.topics.hidden) {
    logger.detail('Topics: Hidden');
  } else {
    logger.detail(`Topics: ${formatCollectionCount(snapshot.topics)}`);
  }

  if (snapshot.replies.status === 'not_requested') {
    logger.detail('Replies: Not requested');
  } else {
    logger.detail(`Replies: ${formatCollectionCount(snapshot.replies)}`);
  }

  const failedCount = snapshot.topics.failedCount + snapshot.replies.failedCount;
  const failedPageCount = snapshot.topics.failedPageCount + snapshot.replies.failedPageCount;
  const identityFailureCount =
    snapshot.topics.identityFailureCount + snapshot.replies.identityFailureCount;
  const isPartial = snapshot.topics.status === 'partial' || snapshot.replies.status === 'partial';

  if (isPartial) {
    logger.detail(
      `Completeness: failed=${failedCount}, failedPages=${failedPageCount}, ` +
        `identityFailures=${identityFailureCount}`,
    );
    logger.warn('抓取数据不完整：缺失记录不能解释为删除，后续分析可能受影响');
  }
}

// -- 命令入口 ----------------------------------------------------------------

/**
 * Fetch requested V2EX user data and persist Raw Snapshot V2.
 *
 * @param username - V2EX member name.
 * @param options - Requested scopes, cache behavior, and pipeline mode.
 * @returns Structured fetch step status and completeness metadata.
 */
export async function runFetch(
  username: string,
  options: FetchCommandOptions,
): Promise<StepRunResult> {
  const capturedAt = new Date();

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

  let topicsRequest: SnapshotRequest<UserTopicsDetailResult> = { requested: false };
  let repliesRequest: SnapshotRequest<UserRepliesResult> = { requested: false };

  // 1. 获取用户资料
  logger.section('获取用户资料...');
  const profile = await getUserProfile(username, {
    events: createFetchEvents('获取资料'),
  });

  if (!profile) {
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

  logger.success(`注册于 ${profile.joinDate}`);
  if (profile.dailyRanking) {
    logger.detail(`活跃排名: #${profile.dailyRanking}`);
  }

  // 2. 获取帖子详情
  if (fetchTopics) {
    logger.section('获取帖子详情...');
    const topicsResult = await getAllUserTopicsDetail(username, {
      events: createFetchEvents('获取帖子'),
    });
    topicsRequest = { requested: true, result: topicsResult };

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
    const replies = await getAllUserReplies(username, {
      events: createFetchEvents('获取回复'),
    });
    repliesRequest = { requested: true, result: replies };

    logger.success(`${replies.data.length} 条回复`);
    if (replies.failedPages > 0) {
      logger.detail(`(${replies.failedPages} 页获取失败)`);
    }
  }

  // Preserve requested scopes and collection diagnostics in one versioned artifact.
  const rawData = buildRawSnapshot({
    username,
    capturedAt,
    profile,
    topics: topicsRequest,
    replies: repliesRequest,
  });

  writeDataFile(username, 'raw', rawData);

  if (!options.pipeline) {
    logger.success('数据已保存');
    printSummary(rawData);
  }

  const failedTopics = rawData.topics.failedCount;
  const failedPages = rawData.topics.failedPageCount + rawData.replies.failedPageCount;
  const identityFailures =
    rawData.topics.identityFailureCount + rawData.replies.identityFailureCount;
  const isPartial = rawData.topics.status === 'partial' || rawData.replies.status === 'partial';

  if (isPartial) {
    return {
      step: 'fetch',
      status: 'partial',
      reasonCode: 'FETCH_PARTIAL_FAILED',
      message: '抓取已完成，但数据完整性不足',
      recoverable: true,
      recoverActions: getRecoveryActions('FETCH_PARTIAL_FAILED', { username }),
      meta: {
        failedTopics,
        failedPages,
        identityFailures,
      },
    };
  }

  return {
    step: 'fetch',
    status: 'success',
    message: '抓取完成',
    meta: {
      fetchedTopics: rawData.topics.fetchedCount,
      fetchedReplies: rawData.replies.fetchedCount,
    },
  };
}
