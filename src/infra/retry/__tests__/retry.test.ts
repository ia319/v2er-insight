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

  it('成功时直接返回结果', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const resultPromise = withRetry(fn, DEFAULT_OPTIONS);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('重试后最终成功', async () => {
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

  it('超过最大重试次数后抛出最后一次错误', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Continuous failure'));

    const resultPromise = withRetry(fn, { maxRetries: 2, baseDelay: 50, maxDelay: 5000 });

    resultPromise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow('Continuous failure');
    expect(fn).toHaveBeenCalledTimes(3); // 初始 + 2 次重试
  });

  it('maxRetries 为 0 时不重试', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Failure'));

    const resultPromise = withRetry(fn, { maxRetries: 0, baseDelay: 100, maxDelay: 5000 });

    resultPromise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow('Failure');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('负数 maxRetries 视为 0，正常抛出错误', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Negative test'));

    const resultPromise = withRetry(fn, { maxRetries: -5, baseDelay: 100, maxDelay: 5000 });

    resultPromise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow('Negative test');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
