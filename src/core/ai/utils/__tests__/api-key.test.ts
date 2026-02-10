/**
 * Unit tests for utils/api-key.ts
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

  it('explicit parameter should have the highest priority', async () => {
    const { resolveApiKey } = await import('../api-key');

    const result = resolveApiKey('explicit-key');

    expect(result).toBe('explicit-key');
  });

  it('config file should have higher priority than environment variables', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ geminiApiKey: 'config-key' }));
    process.env.GOOGLE_API_KEY = 'env-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBe('config-key');
  });

  it('environment variable GOOGLE_API_KEY should be recognized', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.GOOGLE_API_KEY = 'google-env-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBe('google-env-key');
  });

  it('environment variable GEMINI_API_KEY should be recognized', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.GEMINI_API_KEY = 'gemini-env-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBe('gemini-env-key');
  });

  it('should return null when no source is available', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBeNull();
  });

  it('empty string parameter should be ignored', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.GOOGLE_API_KEY = 'fallback-key';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey('   ');

    expect(result).toBe('fallback-key');
  });

  it('config file read error should be ignored', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Read failed');
    });
    process.env.GOOGLE_API_KEY = 'env-fallback';

    const { resolveApiKey } = await import('../api-key');
    const result = resolveApiKey();

    expect(result).toBe('env-fallback');
  });
});
