import { describe, expect, it } from 'vitest';

import { normalizeReplyTime } from '../reply-time';

const capturedAt = new Date('2026-07-12T03:04:05.000Z');

describe('normalizeReplyTime', () => {
  it.each([
    ['3 分钟前', '2026-07-12T03:01:05.000Z', 'minute'],
    ['3 小时前', '2026-07-12T00:04:05.000Z', 'hour'],
    ['3 天前', '2026-07-09T03:04:05.000Z', 'day'],
  ] as const)('normalizes %s against capturedAt', (displayTime, occurredAt, timePrecision) => {
    expect(normalizeReplyTime(displayTime, capturedAt)).toEqual({
      occurredAt,
      timePrecision,
    });
  });

  it('normalizes full Chinese dates in the V2EX timezone', () => {
    expect(normalizeReplyTime('2026 年 7 月 1 日', capturedAt)).toEqual({
      occurredAt: '2026-06-30T16:00:00.000Z',
      timePrecision: 'day',
    });
  });

  it('uses the previous year for future short dates', () => {
    expect(normalizeReplyTime('12 月 31 日', capturedAt)).toEqual({
      occurredAt: '2025-12-30T16:00:00.000Z',
      timePrecision: 'day',
    });
  });

  it('rejects invalid calendar dates', () => {
    expect(normalizeReplyTime('2026 年 2 月 30 日', capturedAt)).toEqual({
      occurredAt: null,
      timePrecision: 'unknown',
    });
  });

  it('preserves unknown formats without guessing', () => {
    expect(normalizeReplyTime('recently', capturedAt)).toEqual({
      occurredAt: null,
      timePrecision: 'unknown',
    });
  });

  it('rejects relative times outside the JavaScript date range', () => {
    expect(normalizeReplyTime('9007199254740991 天前', capturedAt)).toEqual({
      occurredAt: null,
      timePrecision: 'unknown',
    });
  });
});
