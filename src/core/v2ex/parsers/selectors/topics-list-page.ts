/**
 * 帖子列表页选择器
 * 页面：/member/{username}/topics
 */

export const TOPICS_LIST_PAGE_SELECTORS = {
  /** 隐藏提示文本 */
  hiddenIndicator: '.gray',
  /** 帖子链接 */
  topicLink: 'a[href^="/t/"]',
} as const;
