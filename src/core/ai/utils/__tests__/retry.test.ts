/**
 * utils/retry.ts 单元测试
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

  it('成功的函数应该直接返回结果', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const resultPromise = withRetry(fn, { maxRetries: 3 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('失败后重试应该最终成功', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('第一次失败'))
      .mockRejectedValueOnce(new Error('第二次失败'))
      .mockResolvedValue('最终成功');

    const resultPromise = withRetry(fn, { maxRetries: 3, baseDelay: 100 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('最终成功');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('超过最大重试次数应该抛出最后一个错误', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('持续失败'));

    const resultPromise = withRetry(fn, { maxRetries: 2, baseDelay: 50 });

    // 先捕获 promise，再运行 timers
    resultPromise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow('持续失败');
    expect(fn).toHaveBeenCalledTimes(3); // 初始 + 2 次重试
  });

  it('maxRetries 为 0 时不应该重试', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('失败'));

    const resultPromise = withRetry(fn, { maxRetries: 0 });

    // 先捕获 promise，再运行 timers
    resultPromise.catch(() => {});

    await vi.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow('失败');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
