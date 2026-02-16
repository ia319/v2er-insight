/**
 * Unit tests for utils/api-key.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @/config
vi.mock('@/config', () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from '@/config';

const mockedGetConfig = vi.mocked(getConfig);

describe('resolveApiKey', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // 默认返回空 config
    mockedGetConfig.mockReturnValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('explicit parameter should have the highest priority', async () => {
    mockedGetConfig.mockReturnValue({ ai: { apiKey: 'config-key' } });
    process.env.GOOGLE_API_KEY = 'env-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey('explicit-key');

    expect(result).toBe('explicit-key');
  });

  it('config file should have higher priority than environment variables', async () => {
    mockedGetConfig.mockReturnValue({ ai: { apiKey: 'config-key' } });
    process.env.GOOGLE_API_KEY = 'env-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBe('config-key');
  });

  it('environment variable GOOGLE_API_KEY should be recognized', async () => {
    mockedGetConfig.mockReturnValue({});
    process.env.GOOGLE_API_KEY = 'google-env-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBe('google-env-key');
  });

  it('environment variable GEMINI_API_KEY should be recognized', async () => {
    mockedGetConfig.mockReturnValue({});
    delete process.env.GOOGLE_API_KEY;
    process.env.GEMINI_API_KEY = 'gemini-env-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBe('gemini-env-key');
  });

  it('should return null when no source is available', async () => {
    mockedGetConfig.mockReturnValue({});
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBeNull();
  });

  it('empty string parameter should be ignored', async () => {
    mockedGetConfig.mockReturnValue({});
    process.env.GOOGLE_API_KEY = 'fallback-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey('   ');

    expect(result).toBe('fallback-key');
  });

  it('empty apiKey in config should be ignored', async () => {
    mockedGetConfig.mockReturnValue({ ai: { apiKey: '   ' } });
    process.env.GOOGLE_API_KEY = 'env-fallback';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBe('env-fallback');
  });
});
