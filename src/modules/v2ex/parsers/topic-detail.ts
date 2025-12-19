/**
 * 单个帖子页面解析器
 */

import * as cheerio from 'cheerio';

import type { TopicDetailParseResult } from '../types/parse-result';

/**
 * 解析单个帖子页面
 * @param html - 页面 HTML
 * @returns 帖子详情解析结果
 */
export function parseTopicDetail(html: string): TopicDetailParseResult {
  const $ = cheerio.load(html);

  // 主题标题
  const title = $('.header h1').text().trim();

  // 节点名称
  const nodeLink = $('.header a[href^="/go/"]');
  const nodeName = nodeLink.text().trim();

  // 发布时间（从 title 属性获取绝对时间）
  const timeSpan = $('.header small.gray span[title]');
  const createdAt = timeSpan.attr('title') ?? timeSpan.text().trim();

  // 主题内容
  const content = $('.topic_content').text().trim();

  // 点击次数
  let clickCount = 0;
  const headerGray = $('.header small.gray').text();
  const clickMatch = headerGray.match(/(\d+)\s*次点击/);
  if (clickMatch?.[1]) {
    clickCount = parseInt(clickMatch[1], 10);
  }

  // 回复总数和最后回复时间
  let replyCount = 0;
  let lastReplyTime: string | null = null;

  $('span.gray').each((_, el) => {
    const text = $(el).text();
    if (text.includes('条回复')) {
      const parts = text.split('•');
      const countMatch = parts[0]?.match(/(\d+)/);
      if (countMatch?.[1]) {
        replyCount = parseInt(countMatch[1], 10);
      }
      if (parts.length > 1 && parts[1]) {
        lastReplyTime = parts[1].trim();
      }
    }
  });

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
