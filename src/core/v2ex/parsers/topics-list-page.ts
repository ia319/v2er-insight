/**
 * 发帖列表页解析器
 */

import * as cheerio from 'cheerio';

import type { TopicsPageParseResult } from '../types/parse-result';
import { parsePagination } from './utils';
import { TOPICS_LIST_PAGE_SELECTORS } from './selectors';

const { hiddenIndicator: HIDDEN_INDICATOR, topicLink: TOPIC_LINK } = TOPICS_LIST_PAGE_SELECTORS;

/**
 * 解析发帖列表页
 * @param html - 页面 HTML
 * @returns 发帖列表解析结果
 */
export function parseTopicsListPage(html: string): TopicsPageParseResult {
  const $ = cheerio.load(html);

  // 检测是否隐藏
  let isHidden = false;
  $(HIDDEN_INDICATOR).each((_, el) => {
    if ($(el).text().includes('主题列表被隐藏')) {
      isHidden = true;
      return false; // 提前退出循环
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

  // 提取主题 URL（使用 Set 去重，O(n) 复杂度）
  const topicUrlSet = new Set<string>();
  $(TOPIC_LINK).each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      // 提取纯 URL（去掉 #reply 部分）
      const cleanUrl = href.split('#')[0] ?? '';
      if (cleanUrl) {
        topicUrlSet.add(cleanUrl);
      }
    }
  });
  const topicUrls = Array.from(topicUrlSet);

  // 分页信息
  const { currentPage, totalPages } = parsePagination($);

  return {
    isHidden: false,
    topicUrls,
    currentPage,
    totalPages,
  };
}
