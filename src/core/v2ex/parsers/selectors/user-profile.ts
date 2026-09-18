/**
 * 用户主页选择器
 * 页面：/member/{username}
 */

export const USER_PROFILE_SELECTORS = {
  /** 今日活跃度排名链接 */
  dailyRanking: 'a[href="/top/dau"]',
  /** The registration block follows the current or legacy profile heading. */
  registration: '#Main > .box > .cell :is(h1, .bigger) ~ span.gray',
} as const;
