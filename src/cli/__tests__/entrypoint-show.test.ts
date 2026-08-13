import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedRunShow = vi.hoisted(() => vi.fn());
const mockedGetConfig = vi.hoisted(() => vi.fn());

vi.mock('../commands', () => ({
  runFetch: vi.fn(),
  runAnalyze: vi.fn(),
  runAi: vi.fn(),
  runShow: mockedRunShow,
  runPipeline: vi.fn(),
  configProxy: vi.fn(),
  configShow: vi.fn(),
  configSet: vi.fn(),
  configReset: vi.fn(),
  runSessionCheck: vi.fn(),
  runSessionClear: vi.fn(),
  runChat: vi.fn(),
}));

vi.mock('@/config', () => ({
  initFetchProxy: vi.fn(),
  getConfig: mockedGetConfig,
}));

vi.mock('@/infra/logger', () => ({
  logger: {
    setLevel: vi.fn(),
    warn: vi.fn(),
    diagnostic: vi.fn(),
    info: vi.fn(),
    detail: vi.fn(),
  },
}));

let originalArgv: string[];

describe('show entrypoint', () => {
  beforeEach(() => {
    originalArgv = process.argv;
    vi.clearAllMocks();
    mockedGetConfig.mockReturnValue({ log: { level: 'info' } });
    mockedRunShow.mockResolvedValue({ status: 'success' });
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('keeps history and version flags local to show for validation', async () => {
    process.argv = ['node', 'v2er', 'show', 'alice', '--history', '--version', 'v000002', '--json'];

    await import('../index');
    await vi.waitFor(() => {
      expect(mockedRunShow).toHaveBeenCalledWith(
        'alice',
        expect.objectContaining({ history: true, version: 'v000002', json: true }),
      );
    });
  });
});
