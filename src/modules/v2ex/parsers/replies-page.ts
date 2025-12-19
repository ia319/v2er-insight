/**
 * 回复列表页解析器
 */

import * as cheerio from 'cheerio';

import type { V2exReply } from '../types/entities';
import type { RepliesPageParseResult } from '../types/parse-result';

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
  const headerText = $('.header small.gray').text();
  const totalMatch = headerText.match(/回复总数\s+(\d+)/);
  if (totalMatch?.[1]) {
    totalReplies = parseInt(totalMatch[1], 10);
  }

  // 分页信息
  const currentPageEl = $('a.page_current');
  const currentPage = currentPageEl.length > 0 ? parseInt(currentPageEl.text(), 10) : 1;

  const pageLinks = $('a.page_normal');
  let totalPages = currentPage;
  pageLinks.each((_, el) => {
    const pageNum = parseInt($(el).text(), 10);
    if (!isNaN(pageNum) && pageNum > totalPages) {
      totalPages = pageNum;
    }
  });

  // 解析每条回复
  // 回复由成对的 .dock_area 和 .reply_content 组成
  $('.dock_area').each((_, dockEl) => {
    const dockArea = $(dockEl);
    const replyContent = dockArea.next('.reply_content');

    // 主题标题和回复总数
    const topicLink = dockArea.find('a[href^="/t/"]');
    const topicTitle = topicLink.text().trim();
    const topicHref = topicLink.attr('href') ?? '';
    const replyCountMatch = topicHref.match(/#reply(\d+)/);
    const topicReplyCount = replyCountMatch?.[1] ? parseInt(replyCountMatch[1], 10) : 0;

    // 节点名称
    const nodeLink = dockArea.find('a[href^="/go/"]');
    const nodeName = nodeLink.text().trim();

    // 回复时间
    const timeSpan = dockArea.find('span.fade');
    const replyTime = timeSpan.text().trim();

    // 回复内容处理
    const contentHtml = replyContent.html() ?? '';
    let content = replyContent.text().trim();
    let isDirectReply = true;
    let replyTo: string | null = null;

    // 检查是否以 @ 开头（回复他人）
    if (contentHtml.trim().startsWith('@')) {
      isDirectReply = false;
      const memberLink = replyContent.find('a[href^="/member/"]').first();
      if (memberLink.length > 0) {
        replyTo = memberLink.text().trim();
        // 移除 @用户名 部分
        content = content.replace(new RegExp(`^@${replyTo}\\s*`), '').trim();
      }
    }

    replies.push({
      topicTitle,
      topicReplyCount,
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
