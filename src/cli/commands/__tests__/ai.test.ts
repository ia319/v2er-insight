import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { AnalyzerOutput } from '@/core/analyzer';
import type { ThinkingLevel } from '@/config';
import {
  computeAnalysisConfigHash,
  computeAnalysisFingerprint,
  computePayloadHash,
  computeProviderStateKey,
  type AnalysisStateV1,
} from '@/core/provenance';

const mockedReadDataFile = vi.hoisted(() => vi.fn());
const mockedWriteDataFile = vi.hoisted(() => vi.fn());
const mockedCleanExpiredData = vi.hoisted(() => vi.fn());
const mockedReadAnalysisState = vi.hoisted(() => vi.fn());
const mockedUpdateAnalysisState = vi.hoisted(() => vi.fn());
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
  readAnalysisState: mockedReadAnalysisState,
  updateAnalysisState: mockedUpdateAnalysisState,
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

const SOURCE_HASH = 'a'.repeat(64);
const defaultRequest = {
  systemPrompt: 'You are an analyst',
  payload: '{"schemaVersion":2}',
};

function createAnalyzedData(partial = false): AnalyzerOutput {
  return {
    schemaVersion: 2,
    dataQuality: {
      capturedAt: '2026-07-13T00:00:00.000Z',
      topics: {
        status: partial ? 'partial' : 'complete',
        totalExpected: 1,
        fetchedCount: partial ? 0 : 1,
        failedCount: partial ? 1 : 0,
      },
      replies: { status: 'complete', totalExpected: 1, fetchedCount: 1, failedCount: 0 },
    },
    userOverview: {
      joinDate: '2020-01-01',
      lastActiveTime: '2026-07-13',
      topicReplyRatio: 1,
      totalTopics: 1,
      totalReplies: 1,
      isTopicsHidden: false,
      dailyRanking: null,
    },
    summary: { totalPeriods: 0, periods: [] },
    contents: [],
  };
}

function createAnalysisState(analyzed: AnalyzerOutput): AnalysisStateV1 {
  const analysisConfigHash = computeAnalysisConfigHash();
  return {
    schemaVersion: 1,
    raw: {
      semanticDataHash: SOURCE_HASH,
      captureStatus:
        analyzed.dataQuality.topics.status === 'complete' &&
        analyzed.dataQuality.replies.status === 'complete'
          ? 'complete'
          : 'partial',
    },
    analyzed: {
      sourceSemanticHash: SOURCE_HASH,
      analyzerSchemaVersion: analyzed.schemaVersion,
      analysisConfigHash,
      analysisFingerprint: computeAnalysisFingerprint({
        semanticDataHash: SOURCE_HASH,
        analyzerSchemaVersion: analyzed.schemaVersion,
        analysisConfigHash,
      }),
      payloadHash: computePayloadHash(analyzed),
    },
  };
}

interface MockInputContext {
  getState(): AnalysisStateV1;
}

function mockInput(analyzed = createAnalyzedData(), result: unknown = null): MockInputContext {
  let state = createAnalysisState(analyzed);
  mockedReadDataFile.mockImplementation((_username: string, type: string) => {
    if (type === 'analyzed') return analyzed;
    if (type === 'result') return result;
    return null;
  });
  mockedReadAnalysisState.mockImplementation(() => ({ status: 'valid', state }));
  mockedUpdateAnalysisState.mockImplementation(
    (_username: string, update: (current: AnalysisStateV1) => AnalysisStateV1) => {
      state = update(state);
      return state;
    },
  );
  return { getState: () => state };
}

function markDelivered(state: AnalysisStateV1): void {
  if (!state.analyzed) {
    throw new Error('Expected analyzed fixture provenance');
  }
  const providerKey = computeProviderStateKey({
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    systemPrompt: defaultRequest.systemPrompt,
    thinkingLevel: 'high',
    sessionKey: 'default',
  });
  state.providers = {
    [providerKey]: {
      lastSentAnalysisFingerprint: state.analyzed.analysisFingerprint,
      lastSentPayloadHash: state.analyzed.payloadHash,
    },
  };
  state.currentResult = {
    analysisFingerprint: state.analyzed.analysisFingerprint,
    stale: false,
    basedOnPartial: false,
    deliveryMode: 'change',
  };
}

describe('runAi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedWriteDataFile.mockReset();
    mockInput();
    mockedBuildAnalysisRequest.mockReturnValue(defaultRequest);
    mockedCleanExpiredData.mockReturnValue([]);
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

  it('should reject invalid or legacy analyzed data before reading provenance', async () => {
    mockedReadDataFile.mockReturnValue({ schemaVersion: 1 });

    const result = await runAi('testuser', {});

    expect(result.reasonCode).toBe('AI_INPUT_INVALID');
    expect(mockedReadAnalysisState).not.toHaveBeenCalled();
    expect(mockedResolveApiKey).not.toHaveBeenCalled();
  });

  it('should reject invalid analysis state before provider access', async () => {
    mockedReadAnalysisState.mockReturnValue({ status: 'invalid' });

    const result = await runAi('testuser', {});

    expect(result.reasonCode).toBe('PROVENANCE_STATE_INVALID');
    expect(mockedResolveApiKey).not.toHaveBeenCalled();
    expect(MockGeminiProvider).not.toHaveBeenCalled();
  });

  it('should reject missing analyzed provenance before provider access', async () => {
    mockedReadAnalysisState.mockReturnValue({ status: 'missing' });

    const result = await runAi('testuser', {});

    expect(result.reasonCode).toBe('AI_PROVENANCE_MISSING');
    expect(mockedResolveApiKey).not.toHaveBeenCalled();
  });

  it('should reject analyzed data that no longer matches provenance', async () => {
    const context = mockInput();
    const state = context.getState();
    if (!state.analyzed) {
      throw new Error('Expected analyzed fixture provenance');
    }
    state.analyzed.payloadHash = 'b'.repeat(64);

    const result = await runAi('testuser', {});

    expect(result.reasonCode).toBe('AI_SOURCE_MISMATCH');
    expect(mockedResolveApiKey).not.toHaveBeenCalled();
  });

  it('should skip an unchanged delivered analysis without requiring an API key', async () => {
    const context = mockInput(createAnalyzedData(), { summary: 'saved result' });
    markDelivered(context.getState());
    mockedResolveApiKey.mockReturnValue(undefined);

    const result = await runAi('testuser', {});

    expect(result.status).toBe('skipped');
    expect(mockedResolveApiKey).not.toHaveBeenCalled();
    expect(MockGeminiProvider).not.toHaveBeenCalled();
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
    expect(mockedUpdateAnalysisState).not.toHaveBeenCalled();
  });

  it('should resend an unchanged delivered analysis when explicitly requested', async () => {
    const context = mockInput(createAnalyzedData(), { summary: 'saved result' });
    markDelivered(context.getState());
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'resent' }, warnings: [] });

    const result = await runAi('testuser', { resend: true });

    expect(result.status).toBe('success');
    expect(mockSendMessage).toHaveBeenCalledOnce();
    expect(context.getState().currentResult?.deliveryMode).toBe('resend');
  });

  it('should send again when delivery state exists but result.json is missing', async () => {
    const context = mockInput();
    markDelivered(context.getState());
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'restored' }, warnings: [] });

    const result = await runAi('testuser', {});

    expect(result.status).toBe('success');
    expect(mockSendMessage).toHaveBeenCalledOnce();
  });

  it('should send unchanged analysis to a different model target', async () => {
    const context = mockInput(createAnalyzedData(), { summary: 'saved result' });
    markDelivered(context.getState());
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'new model' }, warnings: [] });

    const result = await runAi('testuser', { model: 'gemini-custom-model' });

    expect(result.status).toBe('success');
    expect(MockGeminiProvider).toHaveBeenCalledWith('test-api-key', 'gemini-custom-model');
  });

  it('should show error when API key is missing', async () => {
    mockedResolveApiKey.mockReturnValue(undefined);

    const result = await runAi('testuser', {});

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('API Key'));
    expect(result.reasonCode).toBe('AI_API_KEY_MISSING');
  });

  it('should complete full flow and persist result', async () => {
    const analyzedData = createAnalyzedData();
    const request = defaultRequest;
    const aiResult = { summary: 'Analysis result' };

    const context = mockInput(analyzedData);
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
    expect(mockedUpdateAnalysisState).toHaveBeenCalledOnce();
    expect(context.getState().currentResult?.deliveryMode).toBe('change');
    const [writeOrder] = mockedWriteDataFile.mock.invocationCallOrder;
    const [stateOrder] = mockedUpdateAnalysisState.mock.invocationCallOrder;
    if (writeOrder === undefined || stateOrder === undefined) {
      throw new Error('Expected result and provenance writes');
    }
    expect(writeOrder).toBeLessThan(stateOrder);
    expect(mockedCleanExpiredData).toHaveBeenCalledWith('testuser');
    expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining('已保存'));
    expect(result.status).toBe('success');
  });

  it('should warn before sending analysis based on partial data', async () => {
    mockInput(createAnalyzedData(true));
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'partial' }, warnings: [] });

    const result = await runAi('testuser', {});

    expect(result.status).toBe('success');
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('不完整抓取数据'));
    const [warningOrder] = mockLogger.warn.mock.invocationCallOrder;
    const [sendOrder] = mockSendMessage.mock.invocationCallOrder;
    if (warningOrder === undefined || sendOrder === undefined) {
      throw new Error('Expected partial warning and provider send');
    }
    expect(warningOrder).toBeLessThan(sendOrder);
  });

  it('should not advance delivery state when result persistence fails', async () => {
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'result' }, warnings: [] });
    mockedWriteDataFile.mockImplementation(() => {
      throw new Error('disk full');
    });

    const result = await runAi('testuser', {});

    expect(result.reasonCode).toBe('AI_RESULT_WRITE_FAILED');
    expect(mockedUpdateAnalysisState).not.toHaveBeenCalled();
    expect(mockedCleanExpiredData).not.toHaveBeenCalled();
  });

  it('should not clean intermediate files when delivery state persistence fails', async () => {
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'result' }, warnings: [] });
    mockedUpdateAnalysisState.mockImplementation(() => {
      throw new Error('state changed');
    });

    const result = await runAi('testuser', {});

    expect(result.reasonCode).toBe('PROVENANCE_UPDATE_FAILED');
    expect(mockedWriteDataFile).toHaveBeenCalledWith('testuser', 'result', {
      summary: 'result',
    });
    expect(mockedCleanExpiredData).not.toHaveBeenCalled();
  });

  it('should pass CLI model and thinkingLevel options over config values', async () => {
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
    expect(mockedUpdateAnalysisState).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(result.reasonCode).toBe('AI_PROVIDER_FAILED');
  });

  it('should not persist or clean data when response parsing fails', async () => {
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
    expect(mockedUpdateAnalysisState).not.toHaveBeenCalled();
    expect(mockedCleanExpiredData).not.toHaveBeenCalled();
    expect(result.reasonCode).toBe('AI_PROVIDER_FAILED');
  });

  it('should report failure when the single payload cannot be sent', async () => {
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
    expect(mockedUpdateAnalysisState).not.toHaveBeenCalled();
    expect(result.reasonCode).toBe('AI_PROVIDER_FAILED');
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('AI 单次分析请求失败'));
  });

  it('should log warnings from AI response', async () => {
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
