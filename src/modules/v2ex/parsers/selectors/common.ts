/**
 * 通用选择器
 * 用于多个页面的共享选择器
 */

export const COMMON_SELECTORS = {
  /** 当前页码 */
  currentPage: 'a.page_current',
  /** 其他页码链接 */
  pageLinks: 'a.page_normal',
  /** 灰色文本 */
  grayText: '.gray',
  /** 节点链接 */
  nodeLink: 'a[href^="/go/"]',
  /** 帖子链接 */
  topicLink: 'a[href^="/t/"]',
  /** 用户链接 */
  memberLink: 'a[href^="/member/"]',
} as const;
