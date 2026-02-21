/**
 * retryable 单元测试
 */

import { describe, it, expect } from 'vitest';
import { isRetryable, parseRetryAfter } from '../retryable';
import type { FetchResult } from '../types';

/** 构造测试用 FetchResult */
function makeResult(overrides: Partial<FetchResult> = {}): FetchResult {
  return {
    url: 'https://example.com',
    content: null,
    success: false,
    ...overrides,
  };
}

describe('isRetryable', () => {
  it('网络错误（无 statusCode）→ 可重试', () => {
    const result = makeResult({ error: new Error('ECONNRESET') });
    expect(isRetryable(result)).toBe(true);
  });

  it('429 Too Many Requests → 可重试', () => {
    const result = makeResult({ statusCode: 429 });
    expect(isRetryable(result)).toBe(true);
  });

  it('500 Internal Server Error → 可重试', () => {
    const result = makeResult({ statusCode: 500 });
    expect(isRetryable(result)).toBe(true);
  });

  it('502 Bad Gateway → 可重试', () => {
    const result = makeResult({ statusCode: 502 });
    expect(isRetryable(result)).toBe(true);
  });

  it('503 Service Unavailable → 可重试', () => {
    const result = makeResult({ statusCode: 503 });
    expect(isRetryable(result)).toBe(true);
  });

  it('200 OK → 不可重试', () => {
    const result = makeResult({ statusCode: 200, success: true, content: 'ok' });
    expect(isRetryable(result)).toBe(false);
  });

  it('403 Forbidden → 不可重试', () => {
    const result = makeResult({ statusCode: 403 });
    expect(isRetryable(result)).toBe(false);
  });

  it('404 Not Found → 不可重试', () => {
    const result = makeResult({ statusCode: 404 });
    expect(isRetryable(result)).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('数字字符串 → 返回对应秒数', () => {
    expect(parseRetryAfter({ 'retry-after': '30' })).toBe(30);
  });

  it('0 → 返回 0', () => {
    expect(parseRetryAfter({ 'retry-after': '0' })).toBe(0);
  });

  it('无 Retry-After header → 返回 null', () => {
    expect(parseRetryAfter({ 'content-type': 'text/html' })).toBeNull();
  });

  it('空 headers → 返回 null', () => {
    expect(parseRetryAfter(undefined)).toBeNull();
  });

  it('非数字值 → 返回 null', () => {
    expect(parseRetryAfter({ 'retry-after': 'invalid' })).toBeNull();
  });

  it('大写 Retry-After → 正常解析', () => {
    expect(parseRetryAfter({ 'Retry-After': '5' })).toBe(5);
  });
});
