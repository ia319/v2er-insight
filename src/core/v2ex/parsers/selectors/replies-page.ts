/**
 * 回复列表页选择器
 * 页面：/member/{username}/replies
 */

export const REPLIES_PAGE_SELECTORS = {
  /** The list header keeps the total separate from its translated label. */
  totalRepliesValue: '#Main > .box > .header > .fr > span.snow + strong.gray',
  /** Older pages place the label and total together in a small element. */
  legacyTotalRepliesContainer: '#Main > .box > .header > small.gray',
  /** 回复项容器 */
  replyItem: '.dock_area',
  /** 回复内容 */
  replyContent: '.reply_content',
  /** 回复时间 */
  replyTime: 'span.fade',
  /** 帖子链接 */
  topicLink: 'a[href^="/t/"]',
  /** 节点链接 */
  nodeLink: 'a[href^="/go/"]',
  /** 用户链接 */
  memberLink: 'a[href^="/member/"]',
} as const;
