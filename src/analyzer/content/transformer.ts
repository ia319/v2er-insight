/**
 * 内容转换器
 * 将原始 V2EX 数据转换为 AI 可消费的格式
 */

import type { V2exReply, V2exTopicDetail } from '@/modules/v2ex/types/entities';
import type { ContentTopic, ContentReply } from '../types';

/**
 * 将帖子转换为 AI 输入格式
 * @param topics - 单个活跃期内的帖子数组
 * @returns 转换后的 ContentTopic 数组
 */
export function transformTopics(topics: V2exTopicDetail[]): ContentTopic[] {
  return topics.map((topic) => ({
    title: topic.title,
    nodeName: topic.nodeName,
    content: topic.content,
  }));
}

/**
 * 将回复转换为 AI 输入格式
 * @param replies - 单个活跃期内的回复数组
 * @returns 转换后的 ContentReply 数组
 */
export function transformReplies(replies: V2exReply[]): ContentReply[] {
  return replies.map((reply) => ({
    topicTitle: reply.topicTitle,
    nodeName: reply.nodeName,
    content: reply.content,
  }));
}
