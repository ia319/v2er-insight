import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/config', () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
  getConfigPath: vi.fn(),
}));

const mockLogger = {
  info: vi.fn(),
  detail: vi.fn(),
};

vi.mock('@/infra/logger', () => ({
  logger: mockLogger,
}));

import { readConfig, writeConfig, getConfigPath } from '@/config';

const mockedReadConfig = vi.mocked(readConfig);
const mockedWriteConfig = vi.mocked(writeConfig);
const mockedGetConfigPath = vi.mocked(getConfigPath);

describe('configProxy command', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockedGetConfigPath.mockReturnValue('/mock/path/.v2errc.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('view proxy', () => {
    it('should display current proxy when configured', async () => {
      mockedReadConfig.mockReturnValue({ proxy: 'http://test:8080' });

      const { configProxy } = await import('../config');
      configProxy();

      expect(mockLogger.info).toHaveBeenCalledWith('Current proxy: http://test:8080');
    });

    it('should display no proxy message when not configured', async () => {
      mockedReadConfig.mockReturnValue({});

      const { configProxy } = await import('../config');
      configProxy();

      expect(mockLogger.info).toHaveBeenCalledWith('No proxy configured');
      expect(mockLogger.detail).toHaveBeenCalledWith('Use: v2er config proxy <url>');
    });
  });

  describe('set proxy', () => {
    it('should save proxy and display confirmation', async () => {
      mockedReadConfig.mockReturnValue({});

      const { configProxy } = await import('../config');
      configProxy('http://new-proxy:1234');

      expect(mockedWriteConfig).toHaveBeenCalledWith({ proxy: 'http://new-proxy:1234' });
      expect(mockLogger.info).toHaveBeenCalledWith('Proxy set to: http://new-proxy:1234');
      expect(mockLogger.detail).toHaveBeenCalledWith('Config file: /mock/path/.v2errc.json');
    });

    it('should update existing proxy', async () => {
      mockedReadConfig.mockReturnValue({ proxy: 'http://old:8080' });

      const { configProxy } = await import('../config');
      configProxy('http://new:9999');

      expect(mockedWriteConfig).toHaveBeenCalledWith({ proxy: 'http://new:9999' });
    });
  });

  describe('clear proxy', () => {
    it('should remove proxy from config', async () => {
      mockedReadConfig.mockReturnValue({ proxy: 'http://test:8080' });

      const { configProxy } = await import('../config');
      configProxy(undefined, { clear: true });

      expect(mockedWriteConfig).toHaveBeenCalledWith({});
      expect(mockLogger.info).toHaveBeenCalledWith('Proxy cleared');
    });

    it('should handle clear when no proxy exists', async () => {
      mockedReadConfig.mockReturnValue({});

      const { configProxy } = await import('../config');
      configProxy(undefined, { clear: true });

      expect(mockedWriteConfig).toHaveBeenCalledWith({});
      expect(mockLogger.info).toHaveBeenCalledWith('Proxy cleared');
    });
  });
});
