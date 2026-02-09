/**
 * utils/api-key.ts 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';

// Mock fs 和 os
vi.mock('node:fs');
vi.mock('node:os');

describe('resolveApiKey', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.mocked(os.homedir).mockReturnValue('/home/test');
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('显式参数优先级最高', async () => {
    const { resolveApiKey } = await import('../api-key');

    const result = resolveApiKey('explicit-key');

    expect(result).toBe('explicit-key');
  });

  it('配置文件优先级高于环境变量', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ geminiApiKey: 'config-key' }));
    process.env.GOOGLE_API_KEY = 'env-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBe('config-key');
  });

  it('环境变量 GOOGLE_API_KEY 应该被识别', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.GOOGLE_API_KEY = 'google-env-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBe('google-env-key');
  });

  it('环境变量 GEMINI_API_KEY 应该被识别', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.GEMINI_API_KEY = 'gemini-env-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBe('gemini-env-key');
  });

  it('所有来源都没有时返回 null', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBeNull();
  });

  it('空字符串参数应该被忽略', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.GOOGLE_API_KEY = 'fallback-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey('   ');

    expect(result).toBe('fallback-key');
  });

  it('配置文件读取错误应该被忽略', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('读取失败');
    });
    process.env.GOOGLE_API_KEY = 'env-fallback';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBe('env-fallback');
  });
});
