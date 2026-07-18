/**
 * 发帖列表页解析器
 */

import * as cheerio from 'cheerio';

import type { TopicsPageParseResult } from '../types/parse-result';
import { extractTopicIdFromPath } from '../urls/topic-urls';
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
      invalidTopicCount: 0,
      topicUrls: [],
      currentPage: 1,
      totalPages: 1,
    };
  }

  // Stable topic IDs collapse URL variants into one record.
  const topicUrlsById = new Map<string, string>();
  let invalidTopicCount = 0;
  $(TOPIC_LINK).each((_, el) => {
    const href = $(el).attr('href');
    const topicId = href ? extractTopicIdFromPath(href) : null;

    if (!topicId) {
      invalidTopicCount++;
      return;
    }

    topicUrlsById.set(topicId, `/t/${topicId}`);
  });
  const topicUrls = Array.from(topicUrlsById.values());

  // 分页信息
  const { currentPage, totalPages } = parsePagination($);

  return {
    isHidden: false,
    invalidTopicCount,
    topicUrls,
    currentPage,
    totalPages,
  };
}
