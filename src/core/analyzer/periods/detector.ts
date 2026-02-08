/**
 * 活跃期检测器
 * 通过检测暂停期（>60天无活动）将用户活动分割为多个活跃期
 */

import { ANALYZER_CONFIG } from '../config';
import type { PeriodBoundary } from '../types';

interface Activity {
  date: Date;
}

/**
 * 检测活跃期边界
 * @param activities 按时间升序排列的活动列表
 * @param thresholdDays 暂停期阈值（天），默认 60
 * @returns 活跃期边界列表
 */
export function detectPeriodBoundaries(
  activities: Activity[],
  thresholdDays: number = ANALYZER_CONFIG.INACTIVITY_THRESHOLD_DAYS,
): PeriodBoundary[] {
  if (activities.length === 0) return [];

  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  const periods: PeriodBoundary[] = [];

  let periodStart = activities[0]!.date;
  let lastActivity = activities[0]!.date;

  for (let i = 1; i < activities.length; i++) {
    const current = activities[i]!.date;
    const gap = current.getTime() - lastActivity.getTime();

    if (gap > thresholdMs) {
      // 间隔超过阈值，结束当前活跃期并开启新的
      periods.push({ startDate: periodStart, endDate: lastActivity });
      periodStart = current;
    }

    lastActivity = current;
  }

  // 结束最后一个活跃期
  periods.push({ startDate: periodStart, endDate: lastActivity });

  return periods;
}
