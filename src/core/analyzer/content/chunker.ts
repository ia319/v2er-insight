/**
 * 内容分片器
 * 将大量内容分割成适合 AI 处理的小块
 */

import type { ActivePeriod } from '../types';
import type { PeriodContent, PeriodContentChunk, ContentTopic, ContentReply } from '../types';
import { getConfig } from '@/config';
import { transformTopics, transformReplies } from './transformer';

/**
 * 将活跃期内容转换并按需分片
 *
 * 分片规则：
 * - topics > CHUNK_MAX_TOPICS 或 replies > CHUNK_MAX_REPLIES → 分片
 * - 同一 chunk 只能包含同一活跃期的内容
 *
 * @param period - 单个活跃期数据
 * @returns 完整内容 PeriodContent 或分片数组 PeriodContentChunk[]
 */
export function chunkPeriodContent(period: ActivePeriod): PeriodContent | PeriodContentChunk[] {
  const analyzerConfig = getConfig().analyzer;
  const CHUNK_MAX_TOPICS = analyzerConfig?.chunkMaxTopics ?? 20;
  const CHUNK_MAX_REPLIES = analyzerConfig?.chunkMaxReplies ?? 100;
  const { index: periodIndex, topics, replies } = period;

  // 转换为 AI 格式
  const contentTopics = transformTopics(topics);
  const contentReplies = transformReplies(replies);

  // 判断是否需要分片
  const needsChunking =
    contentTopics.length > CHUNK_MAX_TOPICS || contentReplies.length > CHUNK_MAX_REPLIES;

  if (!needsChunking) {
    // 内容量小，返回完整内容
    return {
      periodIndex,
      topics: contentTopics,
      replies: contentReplies,
    };
  }

  // 需要分片
  return createChunks(
    periodIndex,
    contentTopics,
    contentReplies,
    CHUNK_MAX_TOPICS,
    CHUNK_MAX_REPLIES,
  );
}

/**
 * 创建内容分片
 *
 * 分片策略：
 * - 帖子按 CHUNK_MAX_TOPICS 分组
 * - 回复按 CHUNK_MAX_REPLIES 分组
 * - 每个 chunk 可同时包含帖子和回复
 */
function createChunks(
  periodIndex: number,
  topics: ContentTopic[],
  replies: ContentReply[],
  CHUNK_MAX_TOPICS: number,
  CHUNK_MAX_REPLIES: number,
): PeriodContentChunk[] {
  // 计算需要的 chunk 数量
  const topicChunks = Math.ceil(topics.length / CHUNK_MAX_TOPICS);
  const replyChunks = Math.ceil(replies.length / CHUNK_MAX_REPLIES);
  const totalChunks = Math.max(topicChunks, replyChunks, 1);

  const chunks: PeriodContentChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    // 切分帖子
    const topicStart = i * CHUNK_MAX_TOPICS;
    const topicEnd = topicStart + CHUNK_MAX_TOPICS;
    const chunkTopics = topics.slice(topicStart, topicEnd);

    // 切分回复
    const replyStart = i * CHUNK_MAX_REPLIES;
    const replyEnd = replyStart + CHUNK_MAX_REPLIES;
    const chunkReplies = replies.slice(replyStart, replyEnd);

    chunks.push({
      periodIndex,
      chunkIndex: i,
      totalChunksInPeriod: totalChunks,
      topics: chunkTopics,
      replies: chunkReplies,
    });
  }

  return chunks;
}
