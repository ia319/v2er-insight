/**
 * 分页选择器
 * 用于解析分页信息
 */

export const PAGINATION_SELECTORS = {
  /** 当前页码 */
  currentPage: 'a.page_current',
  /** 其他页码链接 */
  pageLinks: 'a.page_normal',
} as const;
