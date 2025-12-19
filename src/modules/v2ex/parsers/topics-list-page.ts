/**
 * 发帖列表页解析器
 */

import * as cheerio from 'cheerio';

import type { TopicsPageParseResult } from '../types/parse-result';

/**
 * 解析发帖列表页
 * @param html - 页面 HTML
 * @returns 发帖列表解析结果
 */
export function parseTopicsListPage(html: string): TopicsPageParseResult {
  const $ = cheerio.load(html);

  // 检测是否隐藏
  let isHidden = false;
  $('.gray').each((_, el) => {
    if ($(el).text().includes('主题列表被隐藏')) {
      isHidden = true;
    }
  });

  // 如果隐藏，返回空列表
  if (isHidden) {
    return {
      isHidden: true,
      topicUrls: [],
      currentPage: 1,
      totalPages: 1,
    };
  }

  // 提取主题 URL
  const topicUrls: string[] = [];
  $('a[href^="/t/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      // 提取纯 URL（去掉 #reply 部分）
      const cleanUrl = href.split('#')[0] ?? '';
      if (cleanUrl && !topicUrls.includes(cleanUrl)) {
        topicUrls.push(cleanUrl);
      }
    }
  });

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

  return {
    isHidden: false,
    topicUrls,
    currentPage,
    totalPages,
  };
}
