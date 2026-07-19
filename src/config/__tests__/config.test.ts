import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('fs');
vi.mock('os');

const mockedFs = vi.mocked(fs);
const mockedOs = vi.mocked(os);

describe('config/path', () => {
  const mockHomeDir = '/mock/home';

  beforeEach(() => {
    vi.resetModules();
    mockedOs.homedir.mockReturnValue(mockHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getConfigPath', () => {
    it('should return config path in home directory', async () => {
      const { getConfigPath } = await import('../path');
      const result = getConfigPath();
      expect(result).toBe(path.join(mockHomeDir, '.v2er-insight', 'config.json'));
    });
  });
});

describe('config/storage', () => {
  const mockHomeDir = '/mock/home';
  const mockConfigPath = path.join(mockHomeDir, '.v2er-insight', 'config.json');

  beforeEach(() => {
    vi.resetModules();
    mockedOs.homedir.mockReturnValue(mockHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readConfig', () => {
    it('should return empty object when file does not exist', async () => {
      mockedFs.existsSync.mockReturnValue(false);
      const { readConfig } = await import('../storage');

      expect(readConfig()).toEqual({});
      expect(mockedFs.existsSync).toHaveBeenCalledWith(mockConfigPath);
    });

    it('should return parsed config when file exists', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('{"proxy":"http://localhost:8080"}');
      const { readConfig } = await import('../storage');

      expect(readConfig()).toEqual({ proxy: 'http://localhost:8080' });
    });

    it('should return empty object on parse error', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('invalid json');
      const { readConfig } = await import('../storage');

      expect(readConfig()).toEqual({});
    });
  });

  describe('writeConfig', () => {
    it('should write formatted JSON to file with secure permissions', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.writeFileSync.mockImplementation(() => {});
      const { writeConfig } = await import('../storage');

      writeConfig({ proxy: 'http://test:1234' });

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        mockConfigPath,
        JSON.stringify({ proxy: 'http://test:1234' }, null, 2),
        { encoding: 'utf-8', mode: 0o600 },
      );
    });

    it('should create config directory if it does not exist', async () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockImplementation(() => '' as never);
      mockedFs.writeFileSync.mockImplementation(() => {});
      const { writeConfig } = await import('../storage');

      writeConfig({ proxy: 'http://test:1234' });

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(path.join(mockHomeDir, '.v2er-insight'), {
        recursive: true,
      });
    });
  });

  describe('getConfig', () => {
    it('should return defaults when no user config exists', async () => {
      mockedFs.existsSync.mockReturnValue(false);
      const { getConfig } = await import('../storage');

      const config = getConfig();

      expect(config.ai?.provider).toBe('gemini');
      expect(config.ai?.model).toBe('gemini-3.1-pro-preview');
      expect(config.ai?.thinkingLevel).toBe('high');
      expect(config.fetch?.timeout).toBe(30_000);
      expect(config.analyzer?.inactivityThreshold).toBe(60);
      expect(config.data?.keepRaw).toBe(true);
      expect(config.log?.level).toBe('info');
    });

    it('should merge user config over defaults', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(
        JSON.stringify({ ai: { model: 'custom-model' }, proxy: 'http://my-proxy' }),
      );
      const { getConfig } = await import('../storage');

      const config = getConfig();

      // 用户覆盖的值
      expect(config.ai?.model).toBe('custom-model');
      expect(config.proxy).toBe('http://my-proxy');
      // 默认值保留
      expect(config.ai?.provider).toBe('gemini');
      expect(config.ai?.timeout).toBe(60_000);
      expect(config.fetch?.timeout).toBe(30_000);
    });
  });
});

describe('config/ai', () => {
  it('should prefer provider-specific Gemini settings', async () => {
    const { resolveGeminiConfig } = await import('../ai');

    const result = resolveGeminiConfig({
      model: 'legacy-model',
      thinkingLevel: 'low',
      gemini: {
        model: 'provider-model',
        thinkingLevel: 'medium',
      },
    });

    expect(result.model).toBe('provider-model');
    expect(result.thinkingLevel).toBe('medium');
  });

  it('should preserve legacy Gemini settings and current defaults', async () => {
    const { resolveGeminiConfig } = await import('../ai');

    expect(resolveGeminiConfig({ model: 'legacy-model' }).model).toBe('legacy-model');
    expect(resolveGeminiConfig()).toMatchObject({
      model: 'gemini-3.1-pro-preview',
      thinkingLevel: 'high',
      timeout: 60_000,
    });
  });
});

describe('config/proxy', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return proxy from config first', async () => {
    vi.doMock('../storage', () => ({
      readConfig: () => ({ proxy: 'http://config-proxy:8080' }),
    }));
    process.env.HTTPS_PROXY = 'http://env-proxy:8080';

    const { getProxyUrl } = await import('../proxy');
    expect(getProxyUrl()).toBe('http://config-proxy:8080');
  });

  it('should fall back to HTTPS_PROXY', async () => {
    vi.doMock('../storage', () => ({
      readConfig: () => ({}),
    }));
    process.env.HTTPS_PROXY = 'http://https-proxy:8080';

    const { getProxyUrl } = await import('../proxy');
    expect(getProxyUrl()).toBe('http://https-proxy:8080');
  });

  it('should fall back to HTTP_PROXY', async () => {
    vi.doMock('../storage', () => ({
      readConfig: () => ({}),
    }));
    process.env.HTTP_PROXY = 'http://http-proxy:8080';

    const { getProxyUrl } = await import('../proxy');
    expect(getProxyUrl()).toBe('http://http-proxy:8080');
  });

  it('should return undefined when no proxy configured', async () => {
    vi.doMock('../storage', () => ({
      readConfig: () => ({}),
    }));

    const { getProxyUrl } = await import('../proxy');
    expect(getProxyUrl()).toBeUndefined();
  });
});
