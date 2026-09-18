import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseRepliesPage } from '@/core/v2ex/parsers';
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

  it.each([
    ['2 小时 15 分钟前', '2026-07-12T00:49:05.000Z'],
    [' 2小时15分钟前 ', '2026-07-12T00:49:05.000Z'],
    ['1 小时 0 分钟前', '2026-07-12T02:04:05.000Z'],
    ['0 小时 0 分钟前', '2026-07-12T03:04:05.000Z'],
  ])('normalizes compound time %s with minute precision', (displayTime, occurredAt) => {
    expect(normalizeReplyTime(displayTime, capturedAt)).toEqual({
      occurredAt,
      timePrecision: 'minute',
    });
  });

  it('normalizes every compound time from the full replies fixture', () => {
    const html = readFileSync(
      join(__dirname, '../../v2ex/parsers/__tests__/fixtures/replies-page-current.html'),
      'utf8',
    );
    const { replies } = parseRepliesPage(html);
    const normalized = replies.map((reply) => normalizeReplyTime(reply.replyTime, capturedAt));

    expect(normalized).toEqual(
      [
        '2026-07-12T01:57:05.000Z',
        '2026-07-12T00:57:05.000Z',
        '2026-07-11T23:57:05.000Z',
        '2026-07-11T22:57:05.000Z',
        '2026-07-11T21:57:05.000Z',
        '2026-07-11T20:57:05.000Z',
        '2026-07-11T19:57:05.000Z',
        '2026-07-11T18:57:05.000Z',
      ].map((occurredAt) => ({ occurredAt, timePrecision: 'minute' })),
    );
  });

  it.each(['1 小时 60 分钟前', '9007199254740991 小时 1 分钟前'])(
    'rejects an invalid compound time %s',
    (displayTime) => {
      expect(normalizeReplyTime(displayTime, capturedAt)).toEqual({
        occurredAt: null,
        timePrecision: 'unknown',
      });
    },
  );

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
