import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ThinkingLevel } from '@/config';

const mockedReadDataFile = vi.hoisted(() => vi.fn());
const mockedWriteDataFile = vi.hoisted(() => vi.fn());
const mockedCleanExpiredData = vi.hoisted(() => vi.fn());
const mockedResolveApiKey = vi.hoisted(() => vi.fn());
const mockedBuildAnalysisRequest = vi.hoisted(() => vi.fn());
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
  debug: vi.fn(),
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
  buildAnalysisRequest: mockedBuildAnalysisRequest,
  parseResponse: mockedParseResponse,
  resolveApiKey: mockedResolveApiKey,
  withRetry: mockedWithRetry,
}));

vi.mock('@/config', async () => {
  const actual = await vi.importActual<typeof import('@/config')>('@/config');
  return {
    ...actual,
    getConfig: vi.fn().mockReturnValue({
      ai: {
        provider: 'gemini',
        model: 'gemini-3.1-pro-preview',
        thinkingLevel: 'high',
        timeout: 60_000,
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10_000,
      },
    }),
  };
});

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

    const result = await runAi('testuser', {});

    expect(mockedReadDataFile).toHaveBeenCalledWith('testuser', 'analyzed');
    expect(mockedResolveApiKey).not.toHaveBeenCalled();
    expect(MockGeminiProvider).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('testuser'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('v2er analyze'));
    expect(result).toMatchObject({
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_INPUT_MISSING',
    });
  });

  it('should show error when API key is missing', async () => {
    mockedReadDataFile.mockReturnValue({ some: 'data' });
    mockedResolveApiKey.mockReturnValue(undefined);

    const result = await runAi('testuser', {});

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('API Key'));
    expect(result.reasonCode).toBe('AI_API_KEY_MISSING');
  });

  it('should complete full flow and persist result', async () => {
    const analyzedData = { some: 'data' };
    const request = {
      systemPrompt: 'You are an analyst',
      payload: '{"some":"data"}',
    };
    const aiResult = { summary: 'Analysis result' };

    mockedReadDataFile.mockReturnValue(analyzedData);
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue(request);
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('raw response');
    mockedParseResponse.mockReturnValue({ data: aiResult, warnings: [] });
    mockedCleanExpiredData.mockReturnValue([]);

    const result = await runAi('testuser', {});

    expect(MockGeminiProvider).toHaveBeenCalledWith('test-api-key', 'gemini-3.1-pro-preview');
    expect(mockedBuildAnalysisRequest).toHaveBeenCalledWith(analyzedData);
    expect(mockCreateSession).toHaveBeenCalledWith(request.systemPrompt, {
      thinkingLevel: 'high',
      timeout: 60_000,
    });
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(request.payload);
    const [createSessionOrder] = mockCreateSession.mock.invocationCallOrder;
    const [sendMessageOrder] = mockSendMessage.mock.invocationCallOrder;
    if (createSessionOrder === undefined || sendMessageOrder === undefined) {
      throw new Error('Expected provider session and message calls');
    }
    expect(createSessionOrder).toBeLessThan(sendMessageOrder);
    expect(mockLogger.section).toHaveBeenCalledWith('发送完整分析数据至 AI...');
    expect(mockLogger.progress).not.toHaveBeenCalled();
    expect(mockedWithRetry).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10_000,
        onRetry: expect.any(Function),
      }),
    );
    expect(mockedParseResponse).toHaveBeenCalledOnce();
    expect(mockedParseResponse).toHaveBeenCalledWith('raw response');
    expect(mockedWriteDataFile).toHaveBeenCalledWith('testuser', 'result', aiResult);
    expect(mockedCleanExpiredData).toHaveBeenCalledWith('testuser');
    expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining('已保存'));
    expect(result.status).toBe('success');
  });

  it('should pass CLI model and thinkingLevel options over config values', async () => {
    mockedReadDataFile.mockReturnValue({ some: 'data' });
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue({
      systemPrompt: 'prompt',
      payload: 'payload',
    });
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'r' }, warnings: [] });
    mockedCleanExpiredData.mockReturnValue([]);

    await runAi('testuser', {
      model: 'gemini-custom-model',
      thinkingLevel: 'low',
    });

    expect(MockGeminiProvider).toHaveBeenCalledWith('test-api-key', 'gemini-custom-model');
    expect(mockCreateSession).toHaveBeenCalledWith('prompt', {
      thinkingLevel: 'low',
      timeout: 60_000,
    });
  });

  it('should use config values when optional CLI values are omitted', async () => {
    mockedReadDataFile.mockReturnValue({ some: 'data' });
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue({
      systemPrompt: 'prompt',
      payload: 'payload',
    });
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'r' }, warnings: [] });
    mockedCleanExpiredData.mockReturnValue([]);

    await runAi('testuser', { model: true, thinkingLevel: true });

    expect(MockGeminiProvider).toHaveBeenCalledWith('test-api-key', 'gemini-3.1-pro-preview');
    expect(mockCreateSession).toHaveBeenCalledWith('prompt', {
      thinkingLevel: 'high',
      timeout: 60_000,
    });
  });

  it('should reject invalid thinkingLevel value', async () => {
    mockedReadDataFile.mockReturnValue({ some: 'data' });
    mockedResolveApiKey.mockReturnValue('test-api-key');

    const result = await runAi('testuser', { thinkingLevel: 'xyz' as ThinkingLevel });

    expect(result.status).toBe('failed');
    expect(result.reasonCode).toBe('AI_INVALID_THINKING_LEVEL');
    expect(result.recoverable).toBe(false);
    expect(result.recoverActions).toBeDefined();
    expect(result.recoverActions?.length).toBeGreaterThan(0);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('xyz'));
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('should catch and log errors from AI provider', async () => {
    mockedReadDataFile.mockReturnValue({ some: 'data' });
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue({
      systemPrompt: 'prompt',
      payload: 'payload',
    });
    mockCreateSession.mockRejectedValue(new Error('Auth failed'));

    const result = await runAi('testuser', {});

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('AI 单次分析请求失败'));
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Auth failed'));
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(result.reasonCode).toBe('AI_PROVIDER_FAILED');
  });

  it('should not persist or clean data when response parsing fails', async () => {
    mockedReadDataFile.mockReturnValue({ some: 'data' });
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue({
      systemPrompt: 'prompt',
      payload: 'payload',
    });
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('invalid response');
    mockedParseResponse.mockImplementation(() => {
      throw new Error('Invalid response JSON');
    });

    const result = await runAi('testuser', {});

    expect(mockedParseResponse).toHaveBeenCalledOnce();
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
    expect(mockedCleanExpiredData).not.toHaveBeenCalled();
    expect(result.reasonCode).toBe('AI_PROVIDER_FAILED');
  });

  it('should report failure when the single payload cannot be sent', async () => {
    mockedReadDataFile.mockReturnValue({ some: 'data' });
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue({
      systemPrompt: 'prompt',
      payload: 'payload',
    });
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockRejectedValue(new Error('Request failed'));

    const result = await runAi('testuser', {});

    expect(mockSendMessage).toHaveBeenCalledOnce();
    expect(mockedParseResponse).not.toHaveBeenCalled();
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
    expect(result.reasonCode).toBe('AI_PROVIDER_FAILED');
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('AI 单次分析请求失败'));
  });

  it('should log warnings from AI response', async () => {
    mockedReadDataFile.mockReturnValue({ some: 'data' });
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue({
      systemPrompt: 'prompt',
      payload: 'payload',
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

  it('should suppress success detail logs in pipeline mode', async () => {
    mockedReadDataFile.mockReturnValue({ some: 'data' });
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue({
      systemPrompt: 'prompt',
      payload: 'payload',
    });
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({
      data: { summary: 'result' },
      warnings: [],
    });
    mockedCleanExpiredData.mockReturnValue(['raw.json']);

    const result = await runAi('testuser', { pipeline: true });

    expect(result.status).toBe('success');
    expect(mockLogger.success).not.toHaveBeenCalled();
    expect(mockLogger.detail).not.toHaveBeenCalledWith(expect.stringContaining('已清理中间数据'));
  });
});
