/**
 * infra/retry 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../retry';

/** 测试用默认选项 */
const DEFAULT_OPTIONS = { maxRetries: 3, baseDelay: 100, maxDelay: 5000 };

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return result directly on success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const resultPromise = withRetry(fn, DEFAULT_OPTIONS);
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

    const resultPromise = withRetry(fn, DEFAULT_OPTIONS);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('Eventually successful');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw last error when max retries exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Continuous failure'));

    const resultPromise = withRetry(fn, { maxRetries: 2, baseDelay: 50, maxDelay: 5000 });

    resultPromise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow('Continuous failure');
    expect(fn).toHaveBeenCalledTimes(3); // 初始 + 2 次重试
  });

  it('should not retry when maxRetries is 0', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Failure'));

    const resultPromise = withRetry(fn, { maxRetries: 0, baseDelay: 100, maxDelay: 5000 });

    resultPromise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow('Failure');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should treat negative maxRetries as 0', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Negative test'));

    const resultPromise = withRetry(fn, { maxRetries: -5, baseDelay: 100, maxDelay: 5000 });

    resultPromise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow('Negative test');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should cap delay at maxDelay', async () => {
    const sleepSpy = vi.spyOn(globalThis, 'setTimeout');
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('ok');

    // baseDelay 远大于 maxDelay，验证封顶效果
    const resultPromise = withRetry(fn, { maxRetries: 1, baseDelay: 50_000, maxDelay: 500 });
    await vi.runAllTimersAsync();
    await resultPromise;

    // 找到重试的 setTimeout 调用（排除 delay=0 等噪声）
    const delays = sleepSpy.mock.calls.map((call) => call[1] as number).filter((d) => d > 0);

    // 实际延迟应 <= maxDelay * 1.1（含 10% jitter）
    for (const delay of delays) {
      expect(delay).toBeLessThanOrEqual(500 * 1.1);
    }

    sleepSpy.mockRestore();
  });
});
