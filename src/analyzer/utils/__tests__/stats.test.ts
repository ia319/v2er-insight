/**
 * stats 单元测试
 */

import { describe, it, expect } from 'vitest';
import { average, topN, hourDistribution, weekdayDistribution } from '../stats';

describe('average', () => {
  it('should return average of numbers', () => {
    expect(average([1, 2, 3, 4, 5])).toBe(3);
  });

  it('should return 0 for empty array', () => {
    expect(average([])).toBe(0);
  });
});

describe('topN', () => {
  it('should return top N items by count', () => {
    const items = ['a', 'b', 'a', 'c', 'a', 'b'];
    const result = topN(items, (x) => x, 2);
    expect(result).toEqual({ a: 3, b: 2 });
  });

  it('should handle empty array', () => {
    expect(topN([], (x: string) => x, 3)).toEqual({});
  });
});

describe('hourDistribution', () => {
  it('should count hours', () => {
    const dates = [
      new Date(2024, 0, 1, 10, 0, 0),
      new Date(2024, 0, 1, 10, 30, 0),
      new Date(2024, 0, 1, 14, 0, 0),
    ];
    const result = hourDistribution(dates);
    expect(result[10]).toBe(2);
    expect(result[14]).toBe(1);
  });
});

describe('weekdayDistribution', () => {
  it('should return percentages', () => {
    const dates = [
      new Date(2024, 0, 15), // Monday
      new Date(2024, 0, 15), // Monday
      new Date(2024, 0, 16), // Tuesday
      new Date(2024, 0, 17), // Wednesday
    ];
    const result = weekdayDistribution(dates);
    expect(result['周一']).toBe(0.5);
    expect(result['周二']).toBe(0.25);
    expect(result['周三']).toBe(0.25);
  });

  it('should return empty for empty array', () => {
    expect(weekdayDistribution([])).toEqual({});
  });
});
