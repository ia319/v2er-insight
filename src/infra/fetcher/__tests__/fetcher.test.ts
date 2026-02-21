import { type Mocked } from 'vitest';
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { SequentialStrategy } from '../index';
import type { FetchResult } from '../types';

/** 此文件只测试基础行为，不测试重试（maxRetries: 0） */
vi.mock('axios');
vi.mock('../agent', () => ({ getHttpsAgent: () => null }));
vi.mock('@/config', () => ({
  getConfig: () => ({
    fetch: { timeout: 30_000, maxRetries: 0, baseDelay: 1000, maxDelay: 8_000 },
  }),
}));
vi.mock('@/config/defaults', () => ({
  DEFAULT_CONFIG: {
    fetch: { timeout: 30_000, maxRetries: 0, baseDelay: 1000, maxDelay: 8_000 },
  },
}));
const mockedAxios = axios as Mocked<typeof axios>;

// Helper to create a partial Axios response
const createResponse = (
  data: string,
  status: number = 200,
  statusText: string = 'OK',
): Partial<AxiosResponse> => ({
  data,
  status,
  statusText,
  headers: {},
  config: {} as InternalAxiosRequestConfig,
});

describe('SequentialStrategy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedAxios.get.mockResolvedValue(createResponse('') as AxiosResponse);
  });

  it('should fetch URLs sequentially and return results', async () => {
    mockedAxios.get
      .mockResolvedValueOnce(createResponse('<html>Page 1</html>') as AxiosResponse)
      .mockResolvedValueOnce(createResponse('<html>Page 2</html>') as AxiosResponse);

    const strategy = new SequentialStrategy();
    const results: FetchResult[] = [];

    for await (const result of strategy.fetch([
      'https://example.com/page1',
      'https://example.com/page2',
    ])) {
      results.push(result);
    }

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      'https://example.com/page1',
      expect.anything(),
    );
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      2,
      'https://example.com/page2',
      expect.anything(),
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.success).toBe(true);
    expect(results[0]?.content).toBe('<html>Page 1</html>');
    expect(results[1]?.success).toBe(true);
    expect(results[1]?.content).toBe('<html>Page 2</html>');
  });

  it('should handle non-2xx responses correctly', async () => {
    mockedAxios.get
      .mockResolvedValueOnce(createResponse('Not Found', 404, 'Not Found') as AxiosResponse)
      .mockResolvedValueOnce(
        createResponse('Server Error', 500, 'Internal Server Error') as AxiosResponse,
      );

    const strategy = new SequentialStrategy();
    const results: FetchResult[] = [];

    for await (const result of strategy.fetch([
      'https://example.com/404',
      'https://example.com/500',
    ])) {
      results.push(result);
    }

    expect(results).toHaveLength(2);

    // 404 Case
    expect(results[0]?.success).toBe(false);
    expect(results[0]?.statusCode).toBe(404);
    expect(results[0]?.content).toBeNull();
    expect(results[0]?.errorBody).toBe('Not Found');

    // 500 Case
    expect(results[1]?.success).toBe(false);
    expect(results[1]?.statusCode).toBe(500);
    expect(results[1]?.content).toBeNull();
    expect(results[1]?.errorBody).toBe('Server Error');
  });

  it('should handle network exceptions', async () => {
    const networkError = new Error('Network error');
    mockedAxios.get.mockRejectedValueOnce(networkError);

    const strategy = new SequentialStrategy();
    const results: FetchResult[] = [];

    for await (const result of strategy.fetch(['https://example.com/error'])) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(false);
    expect(results[0]?.error).toBe(networkError);
    expect(results[0]?.content).toBeNull();
  });

  it('should handle empty URL list', async () => {
    const strategy = new SequentialStrategy();
    const results: FetchResult[] = [];

    for await (const result of strategy.fetch([])) {
      results.push(result);
    }

    expect(results).toHaveLength(0);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('should trigger event callbacks correctly', async () => {
    // Setup mocks for 3 calls: Success, 404, Network Error
    mockedAxios.get
      .mockResolvedValueOnce(createResponse('OK', 200) as AxiosResponse)
      .mockResolvedValueOnce(createResponse('Not Found', 404) as AxiosResponse)
      .mockRejectedValueOnce(new Error('Network error'));

    const onStart = vi.fn();
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const strategy = new SequentialStrategy();
    const urls = [
      'https://example.com/success',
      'https://example.com/fail',
      'https://example.com/error',
    ];

    for await (const result of strategy.fetch(urls, undefined, { onStart, onSuccess, onError })) {
      expect(result).toBeDefined();
    }

    // Check calls count
    expect(onStart).toHaveBeenCalledTimes(3);

    // Success case
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/success', success: true }),
      0, // index
      3, // total
    );

    // Error cases (404 and Network Error both trigger onError)
    expect(onError).toHaveBeenCalledTimes(2);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/fail',
        success: false,
        statusCode: 404,
      }),
      1,
      3,
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/error', success: false }),
      2,
      3,
    );
  });

  it('should pass options to axios', async () => {
    const strategy = new SequentialStrategy();

    await strategy
      .fetch(['https://example.com/auth'], {
        headers: { Authorization: 'Bearer token' },
        timeout: 1000,
      })
      .next();

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://example.com/auth',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
        timeout: 1000,
      }),
    );
  });
});
