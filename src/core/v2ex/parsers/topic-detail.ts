/**
 * 单个帖子页面解析器
 */

import * as cheerio from 'cheerio';

import type { TopicDetailParseResult } from '../types/parse-result';
import { TOPIC_DETAIL_SELECTORS } from './selectors';

const {
  title: TITLE_SELECTOR,
  nodeLink: NODE_LINK,
  createdAt: CREATED_AT,
  content: CONTENT,
  headerGray: HEADER_GRAY,
  replyInfo: REPLY_INFO,
} = TOPIC_DETAIL_SELECTORS;

/**
 * 解析单个帖子页面
 * @param html - 页面 HTML
 * @returns 帖子详情解析结果
 */
export function parseTopicDetail(html: string): TopicDetailParseResult {
  const $ = cheerio.load(html);

  // 主题标题
  const title = $(TITLE_SELECTOR).text().trim();

  // 节点名称
  const nodeLink = $(NODE_LINK);
  const nodeName = nodeLink.text().trim();

  // 发布时间（从 title 属性获取绝对时间）
  const timeSpan = $(CREATED_AT);
  const createdAt = timeSpan.attr('title') ?? timeSpan.text().trim();

  // 主题内容
  const content = $(CONTENT).text().trim();

  // Author names and relative timestamps contain unrelated digits in child elements.
  let clickCount = 0;
  const headerGray = $(HEADER_GRAY);
  if (headerGray.length === 1) {
    const numbers = headerGray
      .contents()
      .filter((_, node) => node.type === 'text')
      .text()
      .match(/\d+/g);
    if (numbers?.length === 1) {
      clickCount = Number(numbers[0]);
    }
  }

  // 回复总数和最后回复时间
  let replyCount = 0;
  let lastReplyTime: string | null = null;

  const replyInfo = $(REPLY_INFO);
  const separator = replyInfo.children('strong.snow');
  if (replyInfo.length === 1 && separator.length === 1) {
    // Read each side independently so the date cannot be mistaken for a count.
    const countText = separator.get(0)?.prev;
    const dateText = separator.get(0)?.next;
    const countMatch = countText?.type === 'text' ? countText.data.match(/^\s*(\d+)\s+\S/) : null;
    if (countMatch?.[1]) {
      replyCount = Number(countMatch[1]);
    }
    const dateMatch =
      dateText?.type === 'text'
        ? dateText.data.match(/^\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{2}:\d{2})\s*$/)
        : null;
    if (dateMatch?.[1]) {
      lastReplyTime = dateMatch[1];
    }
  }

  return {
    title,
    nodeName,
    createdAt,
    content,
    replyCount,
    lastReplyTime,
    clickCount,
  };
}
