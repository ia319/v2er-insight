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
  /** 头部灰色文本（包含点击次数） */
  headerGray: '.header small.gray',
  /** 回复信息（包含回复数和最后回复时间） */
  replyInfo: 'span.gray',
} as const;
