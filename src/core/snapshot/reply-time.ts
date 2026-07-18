import type { ReplyTimePrecision } from './types';

const V2EX_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Normalized occurrence time paired with its source precision. */
export interface NormalizedReplyTime {
  occurredAt: string | null;
  timePrecision: ReplyTimePrecision;
}

function unknownReplyTime(): NormalizedReplyTime {
  return {
    occurredAt: null,
    timePrecision: 'unknown',
  };
}

function parseRelativeValue(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeRelativeTime(displayTime: string, capturedAt: Date): NormalizedReplyTime | null {
  const patterns: Array<{
    regex: RegExp;
    milliseconds: number;
    precision: Exclude<ReplyTimePrecision, 'unknown'>;
  }> = [
    { regex: /^(\d+)\s*分钟前$/, milliseconds: 60 * 1000, precision: 'minute' },
    { regex: /^(\d+)\s*小时前$/, milliseconds: 60 * 60 * 1000, precision: 'hour' },
    { regex: /^(\d+)\s*天前$/, milliseconds: 24 * 60 * 60 * 1000, precision: 'day' },
  ];

  for (const pattern of patterns) {
    const match = displayTime.match(pattern.regex);
    const value = match?.[1] ? parseRelativeValue(match[1]) : null;
    if (value === null) {
      continue;
    }

    const occurredAt = new Date(capturedAt.getTime() - value * pattern.milliseconds);
    if (Number.isNaN(occurredAt.getTime())) {
      return null;
    }

    return {
      occurredAt: occurredAt.toISOString(),
      timePrecision: pattern.precision,
    };
  }

  return null;
}

function createV2exDay(year: number, month: number, day: number): Date | null {
  const occurredAt = new Date(Date.UTC(year, month - 1, day) - V2EX_TIME_OFFSET_MS);
  const localDate = new Date(occurredAt.getTime() + V2EX_TIME_OFFSET_MS);

  if (
    localDate.getUTCFullYear() !== year ||
    localDate.getUTCMonth() + 1 !== month ||
    localDate.getUTCDate() !== day
  ) {
    return null;
  }

  return occurredAt;
}

function normalizeAbsoluteDay(displayTime: string, capturedAt: Date): NormalizedReplyTime | null {
  const fullDateMatch = displayTime.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日$/);
  const shortDateMatch = displayTime.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日$/);

  let year: number;
  let month: number;
  let day: number;

  if (fullDateMatch?.[1] && fullDateMatch[2] && fullDateMatch[3]) {
    year = Number(fullDateMatch[1]);
    month = Number(fullDateMatch[2]);
    day = Number(fullDateMatch[3]);
  } else if (shortDateMatch?.[1] && shortDateMatch[2]) {
    const capturedV2exTime = new Date(capturedAt.getTime() + V2EX_TIME_OFFSET_MS);
    year = capturedV2exTime.getUTCFullYear();
    month = Number(shortDateMatch[1]);
    day = Number(shortDateMatch[2]);
  } else {
    return null;
  }

  let occurredAt = createV2exDay(year, month, day);
  if (!occurredAt) {
    return null;
  }

  if (!fullDateMatch && occurredAt > capturedAt) {
    occurredAt = createV2exDay(year - 1, month, day);
    if (!occurredAt) {
      return null;
    }
  }

  return {
    occurredAt: occurredAt.toISOString(),
    timePrecision: 'day',
  };
}

/**
 * Normalizes a V2EX reply time against one snapshot capture time.
 *
 * @param displayTime - Time text shown on the V2EX replies page.
 * @param capturedAt - Shared capture time for the complete fetch execution.
 * @returns Normalized occurrence time and its reliable precision.
 */
export function normalizeReplyTime(displayTime: string, capturedAt: Date): NormalizedReplyTime {
  const normalizedDisplayTime = displayTime.trim();

  return (
    normalizeRelativeTime(normalizedDisplayTime, capturedAt) ??
    normalizeAbsoluteDay(normalizedDisplayTime, capturedAt) ??
    unknownReplyTime()
  );
}
