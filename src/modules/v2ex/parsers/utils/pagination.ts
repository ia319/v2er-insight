/**
 * 分页解析工具
 * 提供共享的分页信息解析函数
 */

import type { CheerioAPI } from 'cheerio';

/**
 * 分页信息
 */
export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
}

/**
 * 解析分页信息
 * @param $ - Cheerio 实例
 * @returns 分页信息（当前页和总页数）
 */
export function parsePagination($: CheerioAPI): PaginationInfo {
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

  return { currentPage, totalPages };
}
