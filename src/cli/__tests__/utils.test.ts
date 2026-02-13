import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  detail: vi.fn(),
  progress: vi.fn(),
}));

vi.mock('@/infra/logger', () => ({
  logger: mockLogger,
}));

import { logFetchError, createFetchEvents } from '../utils';

describe('logFetchError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log URL as error', () => {
    logFetchError({ url: 'https://v2ex.com/t/1', content: null, success: false });

    expect(mockLogger.error).toHaveBeenCalledWith('抓取失败: https://v2ex.com/t/1');
  });

  it('should log status code when present', () => {
    logFetchError({ url: 'https://v2ex.com/t/1', content: null, success: false, statusCode: 403 });

    expect(mockLogger.detail).toHaveBeenCalledWith('状态码: 403');
  });

  it('should not log status code when absent', () => {
    logFetchError({ url: 'https://v2ex.com/t/1', content: null, success: false });

    expect(mockLogger.detail).not.toHaveBeenCalledWith(expect.stringContaining('状态码'));
  });

  it('should log error message when error exists', () => {
    logFetchError({
      url: 'https://v2ex.com/t/1',
      content: null,
      success: false,
      error: new Error('timeout'),
    });

    expect(mockLogger.detail).toHaveBeenCalledWith('错误信息: timeout');
  });

  it('should truncate long error body with ellipsis', () => {
    const longBody = 'x'.repeat(300);
    logFetchError({
      url: 'https://v2ex.com/t/1',
      content: null,
      success: false,
      errorBody: longBody,
    });

    const call = mockLogger.detail.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && c[0].includes('响应预览'),
    );
    expect(call).toBeDefined();
    expect(call![0]).toContain('...');
  });

  it('should not add ellipsis for short error body', () => {
    logFetchError({
      url: 'https://v2ex.com/t/1',
      content: null,
      success: false,
      errorBody: 'short error',
    });

    const call = mockLogger.detail.mock.calls.find(
      (c: string[]) => typeof c[0] === 'string' && c[0].includes('响应预览'),
    );
    expect(call).toBeDefined();
    expect(call![0]).not.toContain('...');
  });
});

describe('createFetchEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return object with onStart and onError', () => {
    const events = createFetchEvents('测试');

    expect(events).toHaveProperty('onStart');
    expect(events).toHaveProperty('onError');
  });

  it('onStart should call logger.progress with correct args', () => {
    const events = createFetchEvents('获取帖子');
    events.onStart!('https://v2ex.com', 2, 10);

    expect(mockLogger.progress).toHaveBeenCalledWith(2, 10, '获取帖子');
  });

  it('onError should delegate to logFetchError', () => {
    const events = createFetchEvents('获取回复');
    const result = { url: 'https://v2ex.com/t/1', content: null, success: false };
    events.onError!(result, 0, 1);

    expect(mockLogger.error).toHaveBeenCalledWith('抓取失败: https://v2ex.com/t/1');
  });
});
