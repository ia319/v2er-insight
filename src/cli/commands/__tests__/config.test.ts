import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/config', () => ({
  AI_PROVIDERS: ['gemini', 'codex'],
  DEFAULT_CONFIG: {
    data: { keepRaw: true, rawRetention: 1 },
  },
  THINKING_LEVELS: ['minimal', 'low', 'medium', 'high'],
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
  getConfig: vi.fn(),
  getConfigPath: vi.fn(),
}));

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  diagnostic: vi.fn(),
  detail: vi.fn(),
  error: vi.fn(),
};

vi.mock('@/infra/logger', () => ({
  logger: mockLogger,
}));

import { readConfig, writeConfig, getConfig, getConfigPath } from '@/config';

const mockedReadConfig = vi.mocked(readConfig);
const mockedWriteConfig = vi.mocked(writeConfig);
const mockedGetConfig = vi.mocked(getConfig);
const mockedGetConfigPath = vi.mocked(getConfigPath);

describe('configProxy command', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockedGetConfigPath.mockReturnValue('/mock/path/config.json');
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
      expect(mockLogger.detail).toHaveBeenCalledWith('Config file: /mock/path/config.json');
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

describe('configShow command', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockedGetConfigPath.mockReturnValue('/mock/path/config.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should display full config with defaults', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedGetConfig.mockReturnValue({
      ai: { provider: 'gemini', model: 'gemini-3.1-pro-preview' },
      fetch: { timeout: 30000 },
    });

    const { configShow } = await import('../config');
    configShow();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(consoleSpy.mock.calls[0]![0] as string);
    expect(output.ai.model).toBe('gemini-3.1-pro-preview');
  });

  it('should mask apiKey in display', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedGetConfig.mockReturnValue({
      ai: { apiKey: 'sk-1234567890abcdef' },
    });

    const { configShow } = await import('../config');
    configShow();

    const output = JSON.parse(consoleSpy.mock.calls[0]![0] as string);
    expect(output.ai.apiKey).toBe('sk-1****cdef');
    expect(output.ai.apiKey).not.toContain('1234567890');
  });

  it('should mask short apiKey completely', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedGetConfig.mockReturnValue({
      ai: { apiKey: 'short' },
    });

    const { configShow } = await import('../config');
    configShow();

    const output = JSON.parse(consoleSpy.mock.calls[0]![0] as string);
    expect(output.ai.apiKey).toBe('****');
  });

  it('should mask provider-specific Gemini apiKey', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedGetConfig.mockReturnValue({
      ai: { gemini: { apiKey: 'sk-1234567890abcdef' } },
    });

    const { configShow } = await import('../config');
    configShow('ai');

    const output = JSON.parse(consoleSpy.mock.calls[0]![0] as string);
    expect(output.gemini.apiKey).toBe('sk-1****cdef');
  });

  it('should display specific group when provided', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedGetConfig.mockReturnValue({
      ai: { provider: 'gemini', model: 'test-model' },
      fetch: { timeout: 30000 },
    });

    const { configShow } = await import('../config');
    configShow('ai');

    expect(mockLogger.info).toHaveBeenCalledWith('[ai]');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(consoleSpy.mock.calls[0]![0] as string);
    expect(output.model).toBe('test-model');
  });

  it('should show derived disabled retention status for data config', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedGetConfig.mockReturnValue({ data: { keepRaw: true, rawRetention: 1 } });

    const { configShow } = await import('../config');
    configShow('data');

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(mockLogger.info).toHaveBeenCalledWith('自动清理: 未启用');
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('should show retention warning and documentation when cleanup is enabled', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockedGetConfig.mockReturnValue({ data: { keepRaw: false, rawRetention: 3 } });

    const { configShow } = await import('../config');
    configShow('data');

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[DATA_RETENTION_ENABLED] 已启用 3 天源数据自动清理',
    );
    expect(mockLogger.diagnostic).toHaveBeenCalledWith('warn', '  文档: docs/data-lifecycle.md');
  });

  it('should display proxy when configured', async () => {
    mockedGetConfig.mockReturnValue({ proxy: 'http://test:8080' });

    const { configShow } = await import('../config');
    configShow('proxy');

    expect(mockLogger.info).toHaveBeenCalledWith('[proxy] http://test:8080');
  });

  it('should display proxy not set message', async () => {
    mockedGetConfig.mockReturnValue({});

    const { configShow } = await import('../config');
    configShow('proxy');

    expect(mockLogger.info).toHaveBeenCalledWith('[proxy] (not set)');
  });

  it('should reject unknown group', async () => {
    mockedGetConfig.mockReturnValue({});

    const { configShow } = await import('../config');
    configShow('unknown');

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unknown config group'));
  });
});

describe('configSet command', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should set a string value', async () => {
    mockedReadConfig.mockReturnValue({});

    const { configSet } = await import('../config');
    configSet('ai.model', 'gemini-2.5-flash');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      ai: { model: 'gemini-2.5-flash' },
    });
    expect(mockLogger.info).toHaveBeenCalledWith('Set ai.model = gemini-2.5-flash');
  });

  it('should set a number value with type coercion', async () => {
    mockedReadConfig.mockReturnValue({});

    const { configSet } = await import('../config');
    configSet('ai.timeout', '120000');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      ai: { timeout: 120000 },
    });
  });

  it('should set a boolean value with type coercion', async () => {
    mockedReadConfig.mockReturnValue({});

    const { configSet } = await import('../config');
    configSet('data.keepRaw', 'true');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      data: { keepRaw: true },
    });
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('should warn when automatic source-data cleanup is enabled', async () => {
    mockedReadConfig.mockReturnValue({ data: { rawRetention: 7 } });

    const { configSet } = await import('../config');
    configSet('data.keepRaw', 'false');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      data: { keepRaw: false, rawRetention: 7 },
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[DATA_RETENTION_ENABLED] 已启用 7 天源数据自动清理',
    );
    expect(mockLogger.diagnostic).toHaveBeenCalledWith(
      'warn',
      '  恢复命令: v2er <username> --force',
    );
  });

  it('should warn on retention changes only while cleanup remains enabled', async () => {
    mockedReadConfig.mockReturnValue({ data: { keepRaw: false } });
    const { configSet } = await import('../config');

    configSet('data.rawRetention', '2');

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[DATA_RETENTION_ENABLED] 已启用 2 天源数据自动清理',
    );

    vi.clearAllMocks();
    mockedReadConfig.mockReturnValue({});
    configSet('data.rawRetention', '4');

    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('should validate enum values for thinkingLevel', async () => {
    mockedReadConfig.mockReturnValue({});

    const { configSet } = await import('../config');
    configSet('ai.thinkingLevel', 'invalid');

    expect(mockedWriteConfig).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid value'));
  });

  it('should accept valid enum value for thinkingLevel', async () => {
    mockedReadConfig.mockReturnValue({});

    const { configSet } = await import('../config');
    configSet('ai.thinkingLevel', 'medium');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      ai: { thinkingLevel: 'medium' },
    });
  });

  it('should accept codex provider settings', async () => {
    mockedReadConfig.mockReturnValue({});

    const { configSet } = await import('../config');
    configSet('ai.provider', 'codex');

    expect(mockedWriteConfig).toHaveBeenCalledWith({ ai: { provider: 'codex' } });

    vi.clearAllMocks();
    mockedReadConfig.mockReturnValue({ ai: { provider: 'codex' } });
    configSet('ai.codex.reasoningEffort', 'high');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      ai: { provider: 'codex', codex: { reasoningEffort: 'high' } },
    });
  });

  it('should validate enum for log.level', async () => {
    mockedReadConfig.mockReturnValue({});

    const { configSet } = await import('../config');
    configSet('log.level', 'verbose');

    expect(mockedWriteConfig).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid value'));
  });

  it('should accept valid log.level', async () => {
    mockedReadConfig.mockReturnValue({});

    const { configSet } = await import('../config');
    configSet('log.level', 'debug');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      log: { level: 'debug' },
    });
  });

  it('should reject unknown config path', async () => {
    const { configSet } = await import('../config');
    configSet('unknown.path', 'value');

    expect(mockedWriteConfig).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unknown config path'));
  });

  it('should reject invalid number value', async () => {
    const { configSet } = await import('../config');
    configSet('ai.timeout', 'not-a-number');

    expect(mockedWriteConfig).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid number'));
  });

  it('should reject invalid boolean value', async () => {
    const { configSet } = await import('../config');
    configSet('data.keepRaw', 'yes');

    expect(mockedWriteConfig).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid boolean'));
  });

  it('should reject empty string as number value', async () => {
    const { configSet } = await import('../config');
    configSet('ai.timeout', '');

    expect(mockedWriteConfig).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid number'));
  });

  it('should reject Infinity as number value', async () => {
    const { configSet } = await import('../config');
    configSet('ai.timeout', 'Infinity');

    expect(mockedWriteConfig).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid number'));
  });

  it('should reject negative number value', async () => {
    const { configSet } = await import('../config');
    configSet('ai.timeout', '-1000');

    expect(mockedWriteConfig).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid number'));
  });

  it('should set top-level proxy via set command', async () => {
    mockedReadConfig.mockReturnValue({});

    const { configSet } = await import('../config');
    configSet('proxy', 'http://myproxy:8080');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      proxy: 'http://myproxy:8080',
    });
  });

  it('should set fetch retry config paths', async () => {
    mockedReadConfig.mockReturnValue({});
    const { configSet } = await import('../config');

    configSet('fetch.maxRetries', '5');
    expect(mockedWriteConfig).toHaveBeenCalledWith({ fetch: { maxRetries: 5 } });

    vi.clearAllMocks();
    mockedReadConfig.mockReturnValue({});
    configSet('fetch.baseDelay', '2000');
    expect(mockedWriteConfig).toHaveBeenCalledWith({ fetch: { baseDelay: 2000 } });

    vi.clearAllMocks();
    mockedReadConfig.mockReturnValue({});
    configSet('fetch.maxDelay', '30000');
    expect(mockedWriteConfig).toHaveBeenCalledWith({ fetch: { maxDelay: 30000 } });
  });

  it('should preserve existing config when setting new value', async () => {
    mockedReadConfig.mockReturnValue({
      proxy: 'http://existing:8080',
      ai: { model: 'existing-model' },
    });

    const { configSet } = await import('../config');
    configSet('ai.timeout', '60000');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      proxy: 'http://existing:8080',
      ai: { model: 'existing-model', timeout: 60000 },
    });
  });

  it('should mask apiKey in confirmation output', async () => {
    mockedReadConfig.mockReturnValue({});

    const { configSet } = await import('../config');
    configSet('ai.apiKey', 'sk-1234567890abcdef');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      ai: { apiKey: 'sk-1234567890abcdef' },
    });
    // 确认日志中掩码了 apiKey
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('****'));
  });
});

describe('configReset command', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reset all config when no group specified', async () => {
    const { configReset } = await import('../config');
    configReset();

    expect(mockedWriteConfig).toHaveBeenCalledWith({});
    expect(mockLogger.info).toHaveBeenCalledWith('All configuration reset to defaults');
  });

  it('should reset specific group', async () => {
    mockedReadConfig.mockReturnValue({
      proxy: 'http://test:8080',
      ai: { model: 'test-model', apiKey: 'key' },
      log: { level: 'debug' },
    });

    const { configReset } = await import('../config');
    configReset('ai');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      proxy: 'http://test:8080',
      log: { level: 'debug' },
    });
    expect(mockLogger.info).toHaveBeenCalledWith('Reset: ai');
  });

  it('should remove explicit cleanup settings when resetting data', async () => {
    mockedReadConfig.mockReturnValue({
      data: { keepRaw: false, rawRetention: 7 },
      log: { level: 'debug' },
    });

    const { configReset } = await import('../config');
    configReset('data');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      log: { level: 'debug' },
    });
    expect(mockLogger.info).toHaveBeenCalledWith('Reset: data');
  });

  it('should reset proxy as special top-level key', async () => {
    mockedReadConfig.mockReturnValue({
      proxy: 'http://test:8080',
      ai: { model: 'test-model' },
    });

    const { configReset } = await import('../config');
    configReset('proxy');

    expect(mockedWriteConfig).toHaveBeenCalledWith({
      ai: { model: 'test-model' },
    });
    expect(mockLogger.info).toHaveBeenCalledWith('Reset: proxy');
  });

  it('should reject unknown group', async () => {
    const { configReset } = await import('../config');
    configReset('unknown');

    expect(mockedWriteConfig).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unknown config group'));
  });
});
