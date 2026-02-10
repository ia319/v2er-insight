/**
 * Unit tests for utils/retry.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../retry';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('successful function should return result directly', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const resultPromise = withRetry(fn, { maxRetries: 3 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should eventually succeed after retries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockRejectedValueOnce(new Error('Second failure'))
      .mockResolvedValue('Eventually successful');

    const resultPromise = withRetry(fn, { maxRetries: 3, baseDelay: 100 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('Eventually successful');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw the last error when max retries exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Continuous failure'));

    const resultPromise = withRetry(fn, { maxRetries: 2, baseDelay: 50 });

    // 先捕获 promise，再运行 timers
    resultPromise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow('Continuous failure');
    expect(fn).toHaveBeenCalledTimes(3); // 初始 + 2 次重试
  });

  it('should not retry when maxRetries is 0', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Failure'));

    const resultPromise = withRetry(fn, { maxRetries: 0 });

    // 先捕获 promise，再运行 timers
    resultPromise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow('Failure');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should treat negative maxRetries as 0 and throw error normally', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Negative test'));

    const resultPromise = withRetry(fn, { maxRetries: -5 });

    resultPromise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow('Negative test');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
