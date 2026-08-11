import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedRunSessionClear = vi.hoisted(() => vi.fn());
const mockedGetConfig = vi.hoisted(() => vi.fn());
const mockedLogger = vi.hoisted(() => ({
  setLevel: vi.fn(),
  warn: vi.fn(),
  diagnostic: vi.fn(),
  info: vi.fn(),
  detail: vi.fn(),
}));

vi.mock('../commands', () => ({
  runFetch: vi.fn(),
  runAnalyze: vi.fn(),
  runAi: vi.fn(),
  runShow: vi.fn(),
  runPipeline: vi.fn(),
  configProxy: vi.fn(),
  configShow: vi.fn(),
  configSet: vi.fn(),
  configReset: vi.fn(),
  runSessionCheck: vi.fn(),
  runSessionClear: mockedRunSessionClear,
  runChat: vi.fn(),
}));

vi.mock('@/config', () => ({
  initFetchProxy: vi.fn(),
  getConfig: mockedGetConfig,
}));

vi.mock('@/infra/logger', () => ({
  logger: mockedLogger,
}));

let originalArgv: string[];

describe('session clear entrypoint', () => {
  beforeEach(() => {
    originalArgv = process.argv;
    vi.clearAllMocks();
    mockedGetConfig.mockReturnValue({ log: { level: 'info' } });
    mockedRunSessionClear.mockResolvedValue({
      status: 'failed',
      reasonCode: 'SESSION_DELETE_FAILED',
      deleted: 0,
    });
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('forwards provider and generation scope options', async () => {
    process.argv = [
      'node',
      'v2er',
      'session',
      'clear',
      'alice',
      '--provider',
      'all',
      '--all-versions',
    ];

    await import('../index');
    await vi.waitFor(() => {
      expect(mockedRunSessionClear).toHaveBeenCalledWith(
        'alice',
        expect.objectContaining({ provider: 'all', allVersions: true }),
      );
      expect(mockedLogger.info).toHaveBeenCalledWith('恢复建议:');
      expect(mockedLogger.detail).toHaveBeenCalledWith(
        '命令: v2er session check alice --provider codex',
      );
    });
  });
});
