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
      expect(result).toBe(path.join(mockHomeDir, '.v2errc.json'));
    });
  });
});

describe('config/storage', () => {
  const mockHomeDir = '/mock/home';
  const mockConfigPath = path.join(mockHomeDir, '.v2errc.json');

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
      mockedFs.writeFileSync.mockImplementation(() => {});
      const { writeConfig } = await import('../storage');

      writeConfig({ proxy: 'http://test:1234' });

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        mockConfigPath,
        JSON.stringify({ proxy: 'http://test:1234' }, null, 2),
        { encoding: 'utf-8', mode: 0o600 },
      );
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
