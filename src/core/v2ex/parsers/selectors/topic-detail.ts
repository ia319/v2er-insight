/**
 * 帖子详情页选择器
 * 页面：/t/{topic_id}
 */

export const TOPIC_DETAIL_SELECTORS = {
  /** 帖子标题 */
  title: '.header h1',
  /** 节点链接 */
  nodeLink: '.header a[href^="/go/"]',
  /** 发布时间（带 title 属性的 span） */
  createdAt: '.header small.gray span[title]',
  /** 帖子内容 */
  content: '.topic_content',
  /** Scope view metadata to the topic header rather than other page headers. */
  headerGray: '#Main > .box > .header > small.gray',
  /** The summary separates its count and absolute date with a direct child. */
  replyInfo: '#Main > .box > .cell > span.gray:has(> strong.snow)',
} as const;
