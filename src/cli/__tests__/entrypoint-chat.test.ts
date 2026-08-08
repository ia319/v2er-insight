import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedRunChat = vi.hoisted(() => vi.fn());
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
  runChat: mockedRunChat,
}));

vi.mock('@/config', () => ({
  initFetchProxy: vi.fn(),
  getConfig: mockedGetConfig,
}));

vi.mock('@/infra/logger', () => ({
  logger: { setLevel: vi.fn(), warn: vi.fn(), diagnostic: vi.fn() },
}));

let originalArgv: string[];

describe('chat entrypoint', () => {
  beforeEach(() => {
    originalArgv = process.argv;
    vi.clearAllMocks();
    mockedGetConfig.mockReturnValue({ log: { level: 'info' } });
    mockedRunChat.mockResolvedValue({ status: 'success', provider: 'gemini' });
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('joins message arguments and forwards the explicit provider', async () => {
    process.argv = ['node', 'v2er', 'chat', 'alice', '--provider', 'gemini', 'what', 'changed?'];

    await import('../index');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedRunChat).toHaveBeenCalledWith(
      'alice',
      'what changed?',
      expect.objectContaining({ provider: 'gemini' }),
    );
  });
});
