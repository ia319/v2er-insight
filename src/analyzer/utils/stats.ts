/**
 * 统计工具
 */

/** 计算平均值 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/** 统计分布并返回 Top N */
export function topN<T>(
  items: T[],
  getKey: (item: T) => string,
  n: number,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  // 按数量降序排序，取前 N
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);

  return Object.fromEntries(sorted);
}

/** 计算小时分布 (0-23) */
export function hourDistribution(dates: Date[]): Record<number, number> {
  const dist: Record<number, number> = {};

  for (const date of dates) {
    const hour = date.getHours();
    dist[hour] = (dist[hour] ?? 0) + 1;
  }

  return dist;
}

/** 计算星期分布（百分比） */
export function weekdayDistribution(dates: Date[]): Record<string, number> {
  if (dates.length === 0) return {};

  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const counts: Record<string, number> = {};

  // 初始化所有天数为 0
  weekdays.forEach((day) => {
    counts[day] = 0;
  });

  for (const date of dates) {
    const day = weekdays[date.getDay()] ?? '未知';
    counts[day] = (counts[day] ?? 0) + 1;
  }

  // 转换为百分比
  const total = dates.length;
  const result: Record<string, number> = {};

  for (const day of weekdays) {
    // 即使无活动也要返回 0
    result[day] = total === 0 ? 0 : (counts[day] ?? 0) / total;
  }

  // 按占比降序排序
  const sortedEntries = Object.entries(result).sort(([, a], [, b]) => b - a);

  return Object.fromEntries(sortedEntries);
}
