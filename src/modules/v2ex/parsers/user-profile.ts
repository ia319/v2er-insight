/**
 * 用户主页解析器
 */

import * as cheerio from 'cheerio';

import type { UserProfileParseResult } from '../types/parse-result';

/**
 * 解析用户主页
 * @param html - 页面 HTML
 * @returns 用户主页解析结果
 */
export function parseUserProfile(html: string): UserProfileParseResult {
  const $ = cheerio.load(html);

  // 今日活跃度排名
  const dauLink = $('a[href="/top/dau"]');
  const dailyRanking = dauLink.length > 0 ? parseInt(dauLink.text().trim(), 10) : null;

  // 加入时间
  let joinDate = '';
  $('.gray').each((_, el) => {
    const text = $(el).text();
    if (text.includes('加入于')) {
      // 匹配日期格式：YYYY-MM-DD HH:MM:SS +HH:MM
      const match = text.match(/加入于\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\+\d{2}:\d{2})/);
      if (match?.[1]) {
        joinDate = match[1].trim();
      }
    }
  });

  return {
    dailyRanking: isNaN(dailyRanking as number) ? null : dailyRanking,
    joinDate,
  };
}
