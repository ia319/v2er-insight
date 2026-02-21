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
  it('should retry on network error (no statusCode)', () => {
    const result = makeResult({ error: new Error('ECONNRESET') });
    expect(isRetryable(result)).toBe(true);
  });

  it('should retry on 429 Too Many Requests', () => {
    const result = makeResult({ statusCode: 429 });
    expect(isRetryable(result)).toBe(true);
  });

  it('should retry on 500 Internal Server Error', () => {
    const result = makeResult({ statusCode: 500 });
    expect(isRetryable(result)).toBe(true);
  });

  it('should retry on 502 Bad Gateway', () => {
    const result = makeResult({ statusCode: 502 });
    expect(isRetryable(result)).toBe(true);
  });

  it('should retry on 503 Service Unavailable', () => {
    const result = makeResult({ statusCode: 503 });
    expect(isRetryable(result)).toBe(true);
  });

  it('should not retry on 200 OK', () => {
    const result = makeResult({ statusCode: 200, success: true, content: 'ok' });
    expect(isRetryable(result)).toBe(false);
  });

  it('should not retry on 403 Forbidden', () => {
    const result = makeResult({ statusCode: 403 });
    expect(isRetryable(result)).toBe(false);
  });

  it('should not retry on 404 Not Found', () => {
    const result = makeResult({ statusCode: 404 });
    expect(isRetryable(result)).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('should parse numeric string as seconds', () => {
    expect(parseRetryAfter({ 'retry-after': '30' })).toBe(30);
  });

  it('should return 0 for zero value', () => {
    expect(parseRetryAfter({ 'retry-after': '0' })).toBe(0);
  });

  it('should return null when Retry-After header is missing', () => {
    expect(parseRetryAfter({ 'content-type': 'text/html' })).toBeNull();
  });

  it('should return null for undefined headers', () => {
    expect(parseRetryAfter(undefined)).toBeNull();
  });

  it('should return null for non-numeric value', () => {
    expect(parseRetryAfter({ 'retry-after': 'invalid' })).toBeNull();
  });

  it('should parse capitalized Retry-After header', () => {
    expect(parseRetryAfter({ 'Retry-After': '5' })).toBe(5);
  });
});
