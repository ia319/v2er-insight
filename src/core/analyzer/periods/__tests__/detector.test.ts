/**
 * detector 单元测试
 */

import { describe, it, expect } from 'vitest';
import { detectPeriodBoundaries } from '../detector';

describe('detectPeriodBoundaries', () => {
  it('should return empty for no activities', () => {
    expect(detectPeriodBoundaries([])).toEqual([]);
  });

  it('should return single period for continuous activity', () => {
    const activities = [
      { date: new Date(2024, 0, 1) },
      { date: new Date(2024, 0, 15) },
      { date: new Date(2024, 0, 30) },
    ];
    const periods = detectPeriodBoundaries(activities);
    expect(periods).toHaveLength(1);
    expect(periods[0]?.startDate).toEqual(new Date(2024, 0, 1));
    expect(periods[0]?.endDate).toEqual(new Date(2024, 0, 30));
  });

  it('should split on gap > 60 days', () => {
    const activities = [
      { date: new Date(2024, 0, 1) },
      { date: new Date(2024, 0, 15) },
      // 70 天无活动
      { date: new Date(2024, 3, 1) },
      { date: new Date(2024, 3, 15) },
    ];
    const periods = detectPeriodBoundaries(activities);
    expect(periods).toHaveLength(2);
    expect(periods[0]?.endDate).toEqual(new Date(2024, 0, 15));
    expect(periods[1]?.startDate).toEqual(new Date(2024, 3, 1));
  });

  it('should use custom threshold', () => {
    const activities = [
      { date: new Date(2024, 0, 1) },
      { date: new Date(2024, 0, 5) }, // 4 天后
      // 20 天无活动
      { date: new Date(2024, 0, 25) },
    ];
    // 默认 60 天：单个活跃期
    expect(detectPeriodBoundaries(activities, 60)).toHaveLength(1);
    // 自定义 10 天：两个活跃期（1-5 和 25）
    expect(detectPeriodBoundaries(activities, 10)).toHaveLength(2);
  });
});
