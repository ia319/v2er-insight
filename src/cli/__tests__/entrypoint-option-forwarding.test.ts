import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedRunAi = vi.hoisted(() => vi.fn());
const mockedRunFetch = vi.hoisted(() => vi.fn());
const mockedRunAnalyze = vi.hoisted(() => vi.fn());
const mockedRunShow = vi.hoisted(() => vi.fn());
const mockedRunPipeline = vi.hoisted(() => vi.fn());
const mockedConfigProxy = vi.hoisted(() => vi.fn());
const mockedConfigShow = vi.hoisted(() => vi.fn());
const mockedConfigSet = vi.hoisted(() => vi.fn());
const mockedConfigReset = vi.hoisted(() => vi.fn());
const mockedInitFetchProxy = vi.hoisted(() => vi.fn());
const mockedGetConfig = vi.hoisted(() => vi.fn());
const mockedLoggerSetLevel = vi.hoisted(() => vi.fn());

vi.mock('../commands', () => ({
  runFetch: mockedRunFetch,
  runAnalyze: mockedRunAnalyze,
  runAi: mockedRunAi,
  runShow: mockedRunShow,
  runPipeline: mockedRunPipeline,
  configProxy: mockedConfigProxy,
  configShow: mockedConfigShow,
  configSet: mockedConfigSet,
  configReset: mockedConfigReset,
}));

vi.mock('@/config', () => ({
  initFetchProxy: mockedInitFetchProxy,
  getConfig: mockedGetConfig,
}));

vi.mock('@/infra/logger', () => ({
  logger: {
    setLevel: mockedLoggerSetLevel,
  },
}));

let originalArgv: string[];

describe('cli option forwarding', () => {
  beforeEach(() => {
    originalArgv = process.argv;
    vi.clearAllMocks();
    vi.resetModules();
    mockedGetConfig.mockReturnValue({ log: { level: 'info' } });
    mockedRunAi.mockResolvedValue({ status: 'success' });
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('should forward AI options to the ai subcommand', async () => {
    process.argv = ['node', 'v2er', 'ai', 'alice', '--thinking-level', 'low', '--resend'];

    await import('../index');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedRunAi).toHaveBeenCalledTimes(1);
    expect(mockedRunAi).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({
        thinkingLevel: 'low',
        resend: true,
      }),
    );
  });
});
