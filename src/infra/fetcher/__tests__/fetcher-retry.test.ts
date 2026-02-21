/**
 * Fetcher 重试行为集成测试
 *
 * 使用 vi.mock('axios') 模拟 HTTP 响应，验证 SequentialStrategy 的重试逻辑。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FetchEvents } from '../types';

vi.mock('axios');
vi.mock('../agent', () => ({ getHttpsAgent: () => null }));
vi.mock('@/config', () => ({
  getConfig: () => ({
    fetch: { timeout: 5000, maxRetries: 2, baseDelay: 100, maxDelay: 1000 },
  }),
}));
vi.mock('@/config/defaults', () => ({
  DEFAULT_CONFIG: {
    fetch: { timeout: 5000, maxRetries: 2, baseDelay: 100, maxDelay: 1000 },
  },
}));

import axios from 'axios';
import { SequentialStrategy } from '../fetcher';

const mockedAxios = vi.mocked(axios, true);

/** 收集 generator 所有结果 */
async function collectResults(strategy: SequentialStrategy, urls: string[], events?: FetchEvents) {
  const results = [];
  for await (const result of strategy.fetch(urls, undefined, events)) {
    results.push(result);
  }
  return results;
}

describe('SequentialStrategy retry behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not retry on successful request', async () => {
    mockedAxios.get.mockResolvedValue({ status: 200, data: 'ok' });
    const strategy = new SequentialStrategy();

    const promise = collectResults(strategy, ['https://example.com']);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('should succeed after retrying 5xx', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ status: 502, data: 'Bad Gateway' })
      .mockResolvedValue({ status: 200, data: 'ok' });
    const strategy = new SequentialStrategy();

    const promise = collectResults(strategy, ['https://example.com']);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('should succeed after retrying network error', async () => {
    mockedAxios.get
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue({ status: 200, data: 'ok' });
    const strategy = new SequentialStrategy();

    const promise = collectResults(strategy, ['https://example.com']);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('should not retry on 4xx and return failure immediately', async () => {
    mockedAxios.get.mockResolvedValue({ status: 403, data: 'Forbidden' });
    const strategy = new SequentialStrategy();

    const promise = collectResults(strategy, ['https://example.com']);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.statusCode).toBe(403);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('should return last failure after exhausting maxRetries', async () => {
    mockedAxios.get.mockResolvedValue({ status: 500, data: 'Server Error' });
    const strategy = new SequentialStrategy();

    // config mock 中 maxRetries = 2，因此总共尝试 3 次（1 初始 + 2 重试）
    const promise = collectResults(strategy, ['https://example.com']);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.statusCode).toBe(500);
    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
  });

  it('should fire onRetry event correctly', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ status: 502, data: 'error' })
      .mockResolvedValue({ status: 200, data: 'ok' });
    const strategy = new SequentialStrategy();
    const onRetry = vi.fn();

    const promise = collectResults(strategy, ['https://example.com'], { onRetry });
    await vi.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      'https://example.com',
      1, // attempt
      2, // maxRetries
      expect.any(Number), // delay
      expect.any(String), // reason
    );
  });

  it('should not retry when maxRetries is 0', async () => {
    mockedAxios.get.mockResolvedValue({ status: 500, data: 'error' });
    const strategy = new SequentialStrategy();

    const results = [];
    for await (const result of strategy.fetch(['https://example.com'], { maxRetries: 0 })) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('should retry each URL independently', async () => {
    mockedAxios.get
      // URL 1: 失败一次后成功
      .mockResolvedValueOnce({ status: 502, data: 'error' })
      .mockResolvedValueOnce({ status: 200, data: 'ok1' })
      // URL 2: 直接成功
      .mockResolvedValueOnce({ status: 200, data: 'ok2' });
    const strategy = new SequentialStrategy();

    const promise = collectResults(strategy, ['https://example.com/1', 'https://example.com/2']);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(2);
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(true);
    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
  });
});
