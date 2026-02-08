/**
 * 用户主页选择器
 * 页面：/member/{username}
 */

export const USER_PROFILE_SELECTORS = {
  /** 今日活跃度排名链接 */
  dailyRanking: 'a[href="/top/dau"]',
  /** 灰色文本（包含加入时间） */
  grayText: '.gray',
} as const;
