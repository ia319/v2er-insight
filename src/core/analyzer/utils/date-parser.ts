/**
 * 日期解析工具
 */

/** 解析结果 */
export interface ParsedDate {
  date: Date;
  hasTime: boolean; // 是否有精确时间（小时）
}

/**
 * 解析绝对时间
 * 格式: "2024-01-16 10:00:00 +08:00"
 */
export function parseAbsoluteDate(dateStr: string): ParsedDate | null {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return null;
  }
  return { date, hasTime: true };
}

/**
 * 解析相对时间
 * 格式: "3 分钟前", "2 小时前", "5 天前"
 * @param relativeStr 相对时间字符串
 * @param referenceDate 参考时间，默认为当前时间
 */
export function parseRelativeTime(
  relativeStr: string,
  referenceDate: Date = new Date(),
): ParsedDate | null {
  const patterns: Array<{
    regex: RegExp;
    unit: 'minute' | 'hour' | 'day';
    hasTime: boolean;
  }> = [
    { regex: /(\d+)\s*分钟前/, unit: 'minute', hasTime: true },
    { regex: /(\d+)\s*小时前/, unit: 'hour', hasTime: true },
    { regex: /(\d+)\s*天前/, unit: 'day', hasTime: false },
  ];

  for (const { regex, unit, hasTime } of patterns) {
    const match = relativeStr.match(regex);
    if (match?.[1]) {
      const value = parseInt(match[1], 10);
      const date = new Date(referenceDate);

      switch (unit) {
        case 'minute':
          date.setMinutes(date.getMinutes() - value);
          break;
        case 'hour':
          date.setHours(date.getHours() - value);
          break;
        case 'day':
          date.setDate(date.getDate() - value);
          break;
      }

      return { date, hasTime };
    }
  }

  // 尝试解析中文日期格式
  const chineseDateResult = parseChineseDate(relativeStr, referenceDate);
  if (chineseDateResult) {
    return chineseDateResult;
  }

  return null;
}

/**
 * 解析中文日期格式
 * 格式: "2025 年 4 月 21 日", "4 月 21 日", "1 月 7 日"
 * @param dateStr 日期字符串
 * @param referenceDate 参考时间，用于补充年份
 */
export function parseChineseDate(
  dateStr: string,
  referenceDate: Date = new Date(),
): ParsedDate | null {
  // "2025 年 4 月 21 日" 格式
  const fullMatch = dateStr.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (fullMatch) {
    const year = parseInt(fullMatch[1]!, 10);
    const month = parseInt(fullMatch[2]!, 10) - 1; // JS 月份从 0 开始
    const day = parseInt(fullMatch[3]!, 10);
    return { date: new Date(year, month, day), hasTime: false };
  }

  // "4 月 21 日" 格式（使用参考年份）
  const shortMatch = dateStr.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (shortMatch) {
    const month = parseInt(shortMatch[1]!, 10) - 1;
    const day = parseInt(shortMatch[2]!, 10);
    const year = referenceDate.getFullYear();
    const date = new Date(year, month, day);

    // 如果日期在未来，则为去年
    if (date > referenceDate) {
      date.setFullYear(year - 1);
    }

    return { date, hasTime: false };
  }

  return null;
}

/**
 * 格式化时间范围
 * 输出: "2015-04-01 to 2017-08-15"
 */
export function formatTimeRange(start: Date, end: Date): string {
  const format = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  return `${format(start)} to ${format(end)}`;
}

/** 星期几名称 */
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 获取星期几
 */
export function getWeekday(date: Date): string {
  return WEEKDAY_NAMES[date.getDay()] ?? '未知';
}

/**
 * 获取小时 (0-23)
 */
export function getHour(date: Date): number {
  return date.getHours();
}
