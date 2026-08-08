import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedRunSessionClear = vi.hoisted(() => vi.fn());
const mockedGetConfig = vi.hoisted(() => vi.fn());

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
  logger: { setLevel: vi.fn(), warn: vi.fn(), diagnostic: vi.fn() },
}));

let originalArgv: string[];

describe('session clear entrypoint', () => {
  beforeEach(() => {
    originalArgv = process.argv;
    vi.clearAllMocks();
    mockedGetConfig.mockReturnValue({ log: { level: 'info' } });
    mockedRunSessionClear.mockResolvedValue({ status: 'success', deleted: 3 });
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
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedRunSessionClear).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ provider: 'all', allVersions: true }),
    );
  });
});
