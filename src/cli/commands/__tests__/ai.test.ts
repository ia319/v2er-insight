import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockedReadDataFile = vi.hoisted(() => vi.fn());
const mockedWriteDataFile = vi.hoisted(() => vi.fn());
const mockedCleanExpiredData = vi.hoisted(() => vi.fn());
const mockedResolveApiKey = vi.hoisted(() => vi.fn());
const mockedBuildMessageSequence = vi.hoisted(() => vi.fn());
const mockedParseResponse = vi.hoisted(() => vi.fn());
const mockedWithRetry = vi.hoisted(() => vi.fn());

const mockCreateSession = vi.hoisted(() => vi.fn());
const mockSendMessage = vi.hoisted(() => vi.fn());

const MockGeminiProvider = vi.hoisted(() => {
  return vi.fn().mockImplementation(function () {
    return { createSession: mockCreateSession, sendMessage: mockSendMessage };
  });
});

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  section: vi.fn(),
  detail: vi.fn(),
  warn: vi.fn(),
  progress: vi.fn(),
}));

vi.mock('@/infra/storage', () => ({
  readDataFile: mockedReadDataFile,
  writeDataFile: mockedWriteDataFile,
  cleanExpiredData: mockedCleanExpiredData,
}));

vi.mock('@/core/ai', () => ({
  GeminiProvider: MockGeminiProvider,
  buildMessageSequence: mockedBuildMessageSequence,
  parseResponse: mockedParseResponse,
  resolveApiKey: mockedResolveApiKey,
  withRetry: mockedWithRetry,
  DEFAULT_MODEL: 'gemini-2.0-flash',
  RETRY_CONFIG: { maxRetries: 3, baseDelayMs: 100 },
}));

vi.mock('@/infra/logger', () => ({
  logger: mockLogger,
}));

import { runAi } from '../ai';

describe('runAi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show error when analyzed data is missing', async () => {
    mockedReadDataFile.mockReturnValue(null);

    await runAi('testuser', {});

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('testuser'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('v2er analyze'));
  });

  it('should show error when API key is missing', async () => {
    mockedReadDataFile.mockReturnValue({ some: 'data' });
    mockedResolveApiKey.mockReturnValue(undefined);

    await runAi('testuser', {});

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('API Key'));
  });

  it('should complete full flow and persist result', async () => {
    const analyzedData = { some: 'data' };
    const sequence = {
      systemPrompt: 'You are an analyst',
      messages: ['msg1', 'msg2'],
      finalPrompt: 'Final prompt',
    };
    const aiResult = { summary: 'Analysis result' };

    mockedReadDataFile.mockReturnValue(analyzedData);
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildMessageSequence.mockReturnValue(sequence);
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('raw response');
    mockedParseResponse.mockReturnValue({ data: aiResult, warnings: [] });
    mockedCleanExpiredData.mockReturnValue([]);

    await runAi('testuser', {});

    expect(mockedWriteDataFile).toHaveBeenCalledWith('testuser', 'result', aiResult);
    expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining('已保存'));
  });

  it('should catch and log errors from AI provider', async () => {
    mockedReadDataFile.mockReturnValue({ some: 'data' });
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildMessageSequence.mockReturnValue({
      systemPrompt: 'prompt',
      messages: [],
      finalPrompt: 'final',
    });
    mockCreateSession.mockRejectedValue(new Error('Auth failed'));

    await runAi('testuser', {});

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('AI 分析失败'));
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Auth failed'));
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
  });

  it('should log warnings from AI response', async () => {
    mockedReadDataFile.mockReturnValue({ some: 'data' });
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildMessageSequence.mockReturnValue({
      systemPrompt: 'prompt',
      messages: [],
      finalPrompt: 'final',
    });
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({
      data: { summary: 'result' },
      warnings: ['Missing field: social'],
    });
    mockedCleanExpiredData.mockReturnValue([]);

    await runAi('testuser', {});

    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Missing field'));
  });
});
