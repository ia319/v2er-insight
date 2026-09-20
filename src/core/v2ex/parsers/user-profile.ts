/**
 * 用户主页解析器
 */

import * as cheerio from 'cheerio';

import type { UserProfileParseResult } from '../types/parse-result';
import { USER_PROFILE_SELECTORS } from './selectors';

const { dailyRanking: DAU_SELECTOR, registration: REGISTRATION } = USER_PROFILE_SELECTORS;

/**
 * 解析用户主页
 * @param html - 页面 HTML
 * @returns 用户主页解析结果
 */
export function parseUserProfile(html: string): UserProfileParseResult {
  const $ = cheerio.load(html);

  // 今日活跃度排名
  const dauLink = $(DAU_SELECTOR);
  const dailyRanking = dauLink.length > 0 ? parseInt(dauLink.text().trim(), 10) : null;

  // The surrounding label varies by language; only an unambiguous profile date is retained.
  const registration = $(REGISTRATION);
  const dates =
    registration.length === 1
      ? registration.text().match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{2}:\d{2}/g)
      : null;
  const joinDate = dates?.length === 1 ? (dates[0] ?? '') : '';

  return {
    dailyRanking: isNaN(dailyRanking as number) ? null : dailyRanking,
    joinDate,
  };
}
