import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedGetConfig = vi.hoisted(() => vi.fn());
const mockedResolveApiKey = vi.hoisted(() => vi.fn());
const mockedCheckCodexSession = vi.hoisted(() => vi.fn());

const mockedLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  section: vi.fn(),
  detail: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  progress: vi.fn(),
  diagnostic: vi.fn(),
}));

vi.mock('@/config', async () => {
  const actual = await vi.importActual<typeof import('@/config')>('@/config');
  return { ...actual, getConfig: mockedGetConfig };
});

vi.mock('@/core/ai', async () => {
  const actual = await vi.importActual<typeof import('@/core/ai')>('@/core/ai');
  return { ...actual, resolveApiKey: mockedResolveApiKey };
});

vi.mock('../session/codex-check', () => ({ checkCodexSession: mockedCheckCodexSession }));
vi.mock('@/infra/logger', () => ({ logger: mockedLogger }));

import { runSessionCheck } from '../session';
import type { CodexSessionCheckReport } from '../session/codex-types';

function createCodexReport(): CodexSessionCheckReport {
  return {
    appDetected: true,
    candidates: [
      {
        candidate: {
          path: 'C:\\App\\codex.exe',
          source: 'app-bundle' as const,
          kind: 'native' as const,
        },
        version: { status: 'available' as const, version: '0.2.0' },
        trust: {
          status: 'trusted',
          basis: 'windows-authenticode',
          publisher: 'OpenAI OpCo, LLC',
        },
        selection: 'selected' as const,
      },
    ],
    project: { status: 'available' as const, path: 'D:\\data', source: 'storage' as const },
    runtime: {
      executablePath: 'C:\\App\\codex.exe',
      executableSource: 'app-bundle' as const,
      version: '0.2.0',
      userAgent: 'codex/test',
      codexHome: 'C:\\Users\\test\\.codex',
      accountType: 'chatgpt',
      requiresOpenaiAuth: true,
      modelSelection: 'configured' as const,
      requestedModel: 'app-default',
      requestedReasoningEffort: 'model-default',
      selectedModel: 'gpt-current',
      selectedReasoningEffort: 'high',
      models: [
        {
          model: 'gpt-current',
          displayName: 'GPT Current',
          isDefault: true,
          defaultReasoningEffort: 'high',
          supportedReasoningEfforts: ['medium', 'high'],
        },
      ],
    },
    storage: {
      status: 'inspected' as const,
      sessions: 'missing' as const,
      legacy: 'missing' as const,
      migration: 'not_required' as const,
    },
    registry: { status: 'missing' as const },
    lock: { status: 'missing' as const },
    thread: null,
    issues: [],
  };
}

describe('runSessionCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetConfig.mockReturnValue({ ai: { provider: 'gemini' } });
    mockedResolveApiKey.mockReturnValue('configured');
  });

  it('should report Gemini readiness without invoking Codex diagnostics', async () => {
    mockedResolveApiKey.mockReturnValue(null);

    const result = await runSessionCheck(undefined, { provider: 'gemini' });

    expect(result).toEqual({ status: 'failed', provider: 'gemini' });
    expect(mockedCheckCodexSession).not.toHaveBeenCalled();
    expect(mockedLogger.detail).toHaveBeenCalledWith('API Key: 未配置');
  });

  it('should reject unknown providers before provider diagnostics', async () => {
    const result = await runSessionCheck('alice', { provider: 'unknown' });

    expect(result).toEqual({ status: 'failed', provider: null });
    expect(mockedCheckCodexSession).not.toHaveBeenCalled();
    expect(mockedResolveApiKey).not.toHaveBeenCalled();
  });

  it('should render the selected Codex runtime and visible models', async () => {
    mockedGetConfig.mockReturnValue({
      proxy: 'http://config-proxy.example',
      ai: { provider: 'codex', codex: { reasoningEffort: 'model-default' } },
    });
    mockedCheckCodexSession.mockResolvedValue(createCodexReport());

    const result = await runSessionCheck('alice', { provider: 'codex' });

    expect(result).toEqual({ status: 'success', provider: 'codex' });
    expect(mockedCheckCodexSession).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ model: 'app-default', reasoningEffort: 'model-default' }),
      { proxyUrl: 'http://config-proxy.example' },
    );
    expect(mockedLogger.detail).toHaveBeenCalledWith('当前选择: gpt-current / high');
    expect(mockedLogger.detail).toHaveBeenCalledWith('会话存储: missing');
    expect(mockedLogger.detail).toHaveBeenCalledWith(
      '- gpt-current [默认]; 默认 effort=high; 可选=medium | high',
    );
  });

  it('should fail the command when the Codex report contains an error', async () => {
    mockedGetConfig.mockReturnValue({ ai: { provider: 'codex', codex: {} } });
    mockedCheckCodexSession.mockResolvedValue({
      ...createCodexReport(),
      runtime: null,
      issues: [{ code: 'runtime_unavailable', severity: 'error', message: 'runtime unavailable' }],
    });

    const result = await runSessionCheck('alice', { provider: 'codex' });

    expect(result).toEqual({ status: 'failed', provider: 'codex' });
    expect(mockedLogger.error).toHaveBeenCalledWith('[runtime_unavailable] runtime unavailable');
  });
});
