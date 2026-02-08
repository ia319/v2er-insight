/**
 * date-parser 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  parseAbsoluteDate,
  parseRelativeTime,
  formatTimeRange,
  getWeekday,
  getHour,
} from '../date-parser';

describe('parseAbsoluteDate', () => {
  it('should parse valid date string', () => {
    const result = parseAbsoluteDate('2024-01-16 10:00:00 +08:00');
    expect(result).not.toBeNull();
    expect(result?.date.getFullYear()).toBe(2024);
    expect(result?.hasTime).toBe(true);
  });

  it('should return null for invalid date', () => {
    expect(parseAbsoluteDate('invalid')).toBeNull();
  });
});

describe('parseRelativeTime', () => {
  // 使用数值构造器以避免时区问题
  const reference = new Date(2024, 0, 16, 12, 0, 0);

  it('should parse minutes ago', () => {
    const result = parseRelativeTime('30 分钟前', reference);
    expect(result).not.toBeNull();
    expect(result?.date.getMinutes()).toBe(30);
    expect(result?.hasTime).toBe(true);
  });

  it('should parse hours ago', () => {
    const result = parseRelativeTime('2 小时前', reference);
    expect(result).not.toBeNull();
    expect(result?.date.getHours()).toBe(10);
    expect(result?.hasTime).toBe(true);
  });

  it('should parse days ago', () => {
    const result = parseRelativeTime('5 天前', reference);
    expect(result).not.toBeNull();
    expect(result?.date.getDate()).toBe(11);
    expect(result?.hasTime).toBe(false);
  });

  it('should return null for invalid format', () => {
    expect(parseRelativeTime('unknown', reference)).toBeNull();
  });
});

describe('formatTimeRange', () => {
  it('should format date range', () => {
    // 使用数值构造器：new Date(year, monthIndex, day)
    const start = new Date(2015, 3, 1); // 4月1日
    const end = new Date(2017, 7, 15); // 8月15日
    expect(formatTimeRange(start, end)).toBe('2015-04-01 to 2017-08-15');
  });
});

describe('getWeekday', () => {
  it('should return weekday name', () => {
    const monday = new Date(2024, 0, 15); // 2024-01-15 is Monday
    expect(getWeekday(monday)).toBe('周一');
  });
});

describe('getHour', () => {
  it('should return hour', () => {
    const date = new Date(2024, 0, 16, 14, 30, 0);
    expect(getHour(date)).toBe(14);
  });
});
