import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedRunSessionCheck = vi.hoisted(() => vi.fn());
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
  runSessionCheck: mockedRunSessionCheck,
}));

vi.mock('@/config', () => ({
  initFetchProxy: vi.fn(),
  getConfig: mockedGetConfig,
}));

vi.mock('@/infra/logger', () => ({
  logger: { setLevel: vi.fn() },
}));

let originalArgv: string[];

describe('session check entrypoint', () => {
  beforeEach(() => {
    originalArgv = process.argv;
    vi.clearAllMocks();
    mockedGetConfig.mockReturnValue({ log: { level: 'info' } });
    mockedRunSessionCheck.mockResolvedValue({ status: 'success', provider: 'codex' });
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('should forward the optional user and provider', async () => {
    process.argv = ['node', 'v2er', 'session', 'check', 'alice', '--provider', 'codex'];

    await import('../index');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedRunSessionCheck).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ provider: 'codex' }),
    );
  });
});
