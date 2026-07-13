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
