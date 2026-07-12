/**
 * 回复列表页解析器
 */

import * as cheerio from 'cheerio';

import type { V2exReply } from '../types/entities';
import type { RepliesPageParseResult } from '../types/parse-result';
import { extractReplyIdentityFromPath } from '../urls/topic-urls';
import { parsePagination } from './utils';
import { REPLIES_PAGE_SELECTORS } from './selectors';

const {
  totalRepliesContainer: TOTAL_CONTAINER,
  replyItem: REPLY_ITEM,
  replyContent: REPLY_CONTENT,
  replyTime: REPLY_TIME,
  topicLink: TOPIC_LINK,
  nodeLink: NODE_LINK,
  memberLink: MEMBER_LINK,
} = REPLIES_PAGE_SELECTORS;

/**
 * 解析回复列表页
 * @param html - 页面 HTML
 * @returns 回复列表解析结果
 */
export function parseRepliesPage(html: string): RepliesPageParseResult {
  const $ = cheerio.load(html);
  const replies: V2exReply[] = [];

  // 获取用户回复总数
  let totalReplies = 0;
  const headerText = $(TOTAL_CONTAINER).text();
  const totalMatch = headerText.match(/回复总数\s+(\d+)/);
  if (totalMatch?.[1]) {
    totalReplies = parseInt(totalMatch[1], 10);
  }

  // 分页信息
  const { currentPage, totalPages } = parsePagination($);

  // 解析每条回复
  $(REPLY_ITEM).each((_, dockEl) => {
    const dockArea = $(dockEl);
    // .reply_content 在 .dock_area 的下一个兄弟元素 (.inner 或 .cell) 内部
    const replyContentWrapper = dockArea.next();
    const replyContent = replyContentWrapper.find(REPLY_CONTENT);

    // Derive identity from the source link instead of mutable content.
    const topicLink = dockArea.find(TOPIC_LINK);
    const topicTitle = topicLink.text().trim();
    const topicHref = topicLink.attr('href') ?? '';
    const replyIdentity = extractReplyIdentityFromPath(topicHref);

    // 节点名称
    const nodeLink = dockArea.find(NODE_LINK);
    const nodeName = nodeLink.text().trim();

    // 回复时间
    const timeSpan = dockArea.find(REPLY_TIME);
    const replyTime = timeSpan.text().trim();

    // 回复内容处理
    const contentHtml = replyContent.html() ?? '';
    let content = replyContent.text().trim();
    let isDirectReply = true;
    let replyTo: string | null = null;

    // 检查是否以 @ 开头（回复他人）
    if (contentHtml.trim().startsWith('@')) {
      isDirectReply = false;
      const memberLink = replyContent.find(MEMBER_LINK).first();
      if (memberLink.length > 0) {
        replyTo = memberLink.text().trim();
        // 移除 @用户名 部分（使用字符串方法避免 ReDoS）
        const atPrefix = `@${replyTo}`;
        if (content.startsWith(atPrefix)) {
          content = content.slice(atPrefix.length).trim();
        }
      }
    }

    replies.push({
      replyId: replyIdentity?.replyId ?? null,
      topicId: replyIdentity?.topicId ?? null,
      replyNumber: replyIdentity?.replyNumber ?? null,
      topicTitle,
      nodeName,
      replyTime,
      content,
      isDirectReply,
      replyTo,
    });
  });

  return {
    totalReplies,
    replies,
    currentPage,
    totalPages,
  };
}
