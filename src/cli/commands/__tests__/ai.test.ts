import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { AnalyzerOutput } from '@/core/analyzer';
import type { AIAnalysisResult } from '@/core/ai';
import type { ThinkingLevel } from '@/config';
import {
  computeAnalysisConfigHash,
  computeAnalysisFingerprint,
  computePayloadHash,
  computeProviderStateKey,
  hashCanonicalJson,
  type AnalysisState,
} from '@/core/provenance';
import type { ResultVersionMetadata, ResultVersionSource } from '@/core/result-version';

const mockedReadDataFile = vi.hoisted(() => vi.fn());
const mockedCleanExpiredData = vi.hoisted(() => vi.fn());
const mockedReadAnalysisState = vi.hoisted(() => vi.fn());
const mockedUpdateAnalysisState = vi.hoisted(() => vi.fn());
const mockedRecoverResultVersionDelivery = vi.hoisted(() => vi.fn());
const mockedSaveResultVersion = vi.hoisted(() => vi.fn());
const mockedResolveApiKey = vi.hoisted(() => vi.fn());
const mockedBuildAnalysisRequest = vi.hoisted(() => vi.fn());
const mockedParseResponse = vi.hoisted(() => vi.fn());
const mockedWithRetry = vi.hoisted(() => vi.fn());
const mockedExecuteCodexAnalysis = vi.hoisted(() => vi.fn());
const mockedInspectCodexResultDeliverySession = vi.hoisted(() => vi.fn());
const mockedGetConfig = vi.hoisted(() => vi.fn());
const mockedWithCodexExecutionLock = vi.hoisted(() => vi.fn());

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

vi.mock('@/infra/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infra/storage')>();
  return {
    ...actual,
    readDataFile: mockedReadDataFile,
    cleanExpiredData: mockedCleanExpiredData,
    readAnalysisState: mockedReadAnalysisState,
    recoverResultVersionDelivery: mockedRecoverResultVersionDelivery,
    saveResultVersion: mockedSaveResultVersion,
    updateAnalysisState: mockedUpdateAnalysisState,
    withCodexExecutionLock: mockedWithCodexExecutionLock,
  };
});

vi.mock('@/core/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/ai')>();
  return {
    ...actual,
    GeminiProvider: MockGeminiProvider,
    buildAnalysisRequest: mockedBuildAnalysisRequest,
    parseResponse: mockedParseResponse,
    resolveApiKey: mockedResolveApiKey,
    withRetry: mockedWithRetry,
  };
});

vi.mock('@/config', async () => {
  const actual = await vi.importActual<typeof import('@/config')>('@/config');
  return {
    ...actual,
    getConfig: mockedGetConfig,
  };
});

vi.mock('../ai/codex', () => ({
  executeCodexAnalysis: mockedExecuteCodexAnalysis,
  inspectCodexResultDeliverySession: mockedInspectCodexResultDeliverySession,
}));

vi.mock('@/infra/logger', () => ({
  logger: mockLogger,
}));

import { runAi } from '../ai';
import { CodexProjectPathError } from '@/core/ai/providers/codex';
import { CodexExecutionLockBusyError } from '@/infra/storage';
import packageJson from '../../../../package.json';

const SOURCE_HASH = 'a'.repeat(64);
const DELIVERY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CODEX_PROVIDER_KEY = `codex:${'d'.repeat(64)}`;
const defaultRequest = {
  systemPrompt: 'You are an analyst',
  promptHash: 'c'.repeat(64),
  payload: '{"schemaVersion":2}',
};
const noCleanupResult = {
  enabled: false,
  retentionDays: 1,
  deleted: [],
  skipped: [],
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

function createAiResult(summary = 'Saved result'): AIAnalysisResult {
  return {
    summary,
    professional: {
      tech_stack: ['TypeScript'],
      career_path: 'Backend',
      level: 'Senior',
      focus_coherence: 'High',
      evolution: { summary: 'Stable growth', timeline: [] },
    },
    personal: { hobbies: ['Reading'], life_stage: 'Career growth', values: ['Quality'] },
    psychological: {
      scores: {
        openness: 80,
        conscientiousness: 70,
        extraversion: 50,
        agreeableness: 60,
        neuroticism: 30,
      },
      keywords: ['Analytical'],
    },
    behavioral: {
      role: 'Contributor',
      interaction_style: 'Constructive',
      active_pattern: 'Weekday',
      heat_sensitivity: 'Low',
    },
    social: { content_appeal: 'Technical depth', discussion_depth: 'Deep' },
    risk: { level: 'safe', reason: 'Normal activity' },
  };
}

function createAnalysisState(analyzed: AnalyzerOutput): AnalysisState {
  const analysisConfigHash = computeAnalysisConfigHash();
  return {
    schemaVersion: 2,
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
  getState(): AnalysisState;
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
    (_username: string, update: (current: AnalysisState) => AnalysisState) => {
      state = update(state);
      return state;
    },
  );
  return { getState: () => state };
}

function markDelivered(state: AnalysisState): void {
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
    resultVersionId: null,
  };
}

function setPendingGeminiDelivery(
  state: AnalysisState,
  resultVersionId: string | null = null,
): void {
  if (!state.analyzed) {
    throw new Error('Expected analyzed fixture provenance');
  }
  state.pendingResultDelivery = {
    deliveryId: DELIVERY_ID,
    providerKey: computeProviderStateKey({
      provider: 'gemini',
      model: 'gemini-3.1-pro-preview',
      systemPrompt: defaultRequest.systemPrompt,
      thinkingLevel: 'high',
      sessionKey: 'default',
    }),
    analysisFingerprint: state.analyzed.analysisFingerprint,
    payloadHash: state.analyzed.payloadHash,
    basedOnPartial: false,
    deliveryMode: 'change',
    resultVersionId,
  };
}

function setPendingCodexDelivery(
  state: AnalysisState,
  resultVersionId: string | null = null,
): void {
  if (!state.analyzed) {
    throw new Error('Expected analyzed fixture provenance');
  }
  state.pendingResultDelivery = {
    deliveryId: DELIVERY_ID,
    providerKey: CODEX_PROVIDER_KEY,
    analysisFingerprint: state.analyzed.analysisFingerprint,
    payloadHash: state.analyzed.payloadHash,
    basedOnPartial: false,
    deliveryMode: 'change',
    resultVersionId,
  };
}

function createSavedMetadata(
  source: ResultVersionSource,
  overrides: Partial<ResultVersionMetadata> = {},
): ResultVersionMetadata {
  return {
    versionId: 'v000001',
    sequence: 1,
    origin: source.origin,
    deliveryId: source.deliveryId,
    previousLatestVersionId: null,
    previousCurrentHash: null,
    createdAt: source.createdAt,
    savedAt: '2026-07-26T08:00:00.000Z',
    provider: source.provider,
    model: source.model,
    reasoningLevel: source.reasoningLevel,
    localSessionId: source.localSessionId,
    externalThreadId: source.externalThreadId,
    threadName: source.threadName,
    promptHash: source.promptHash,
    analysisFingerprint: source.analysisFingerprint,
    payloadHash: source.payloadHash,
    resultHash: 'f'.repeat(64),
    dataQuality: source.dataQuality,
    warningCount: source.warningCount,
    appVersion: source.appVersion,
    ...overrides,
  };
}

describe('runAi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetConfig.mockReturnValue({
      ai: {
        provider: 'gemini',
        model: 'gemini-3.1-pro-preview',
        thinkingLevel: 'high',
        timeout: 60_000,
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10_000,
      },
    });
    mockedWithCodexExecutionLock.mockImplementation(
      (_username: string, operation: () => Promise<unknown>) => operation(),
    );
    mockedInspectCodexResultDeliverySession.mockReturnValue('completed');
    mockedRecoverResultVersionDelivery.mockReturnValue({ status: 'missing' });
    mockedSaveResultVersion.mockImplementation(
      (_username: string, _result: AIAnalysisResult, source: ResultVersionSource) =>
        createSavedMetadata(source),
    );
    mockInput();
    mockedBuildAnalysisRequest.mockReturnValue(defaultRequest);
    mockedCleanExpiredData.mockReturnValue(noCleanupResult);
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
    const context = mockInput(createAnalyzedData(), createAiResult());
    markDelivered(context.getState());
    mockedResolveApiKey.mockReturnValue(undefined);

    const result = await runAi('testuser', {});

    expect(result.status).toBe('skipped');
    expect(mockedResolveApiKey).not.toHaveBeenCalled();
    expect(MockGeminiProvider).not.toHaveBeenCalled();
    expect(mockedSaveResultVersion).not.toHaveBeenCalled();
    expect(mockedUpdateAnalysisState).not.toHaveBeenCalled();
  });

  it('should recover a saved Gemini delivery before considering another provider call', async () => {
    const recoveredResult = createAiResult('Recovered result');
    const context = mockInput();
    const state = context.getState();
    setPendingGeminiDelivery(state);
    const pending = state.pendingResultDelivery;
    if (!pending) throw new Error('Expected pending Gemini delivery');
    const metadata = createSavedMetadata({
      deliveryId: pending.deliveryId,
      origin: 'analysis',
      createdAt: '2026-07-26T07:59:00.000Z',
      provider: 'gemini',
      model: 'gemini-3.1-pro-preview',
      reasoningLevel: 'high',
      localSessionId: null,
      externalThreadId: null,
      threadName: null,
      promptHash: defaultRequest.promptHash,
      analysisFingerprint: pending.analysisFingerprint,
      payloadHash: pending.payloadHash,
      dataQuality: 'complete',
      warningCount: 0,
      appVersion: '1.2.0',
    });
    mockedRecoverResultVersionDelivery.mockReturnValue({
      status: 'recovered',
      metadata,
      result: recoveredResult,
    });

    const result = await runAi('testuser', {});

    expect(result.status).toBe('skipped');
    expect(mockedRecoverResultVersionDelivery).toHaveBeenCalledWith('testuser', pending);
    expect(mockedResolveApiKey).not.toHaveBeenCalled();
    expect(MockGeminiProvider).not.toHaveBeenCalled();
    expect(context.getState().pendingResultDelivery).toBeUndefined();
    expect(context.getState().currentResult?.resultVersionId).toBe('v000001');
  });

  it('should block Gemini while an accepted Codex delivery remains incomplete', async () => {
    const context = mockInput();
    setPendingCodexDelivery(context.getState());

    const result = await runAi('testuser', {});

    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'AI_CODEX_SESSION_UPDATE_FAILED',
    });
    expect(mockedWithCodexExecutionLock).toHaveBeenCalledOnce();
    expect(mockedRecoverResultVersionDelivery).toHaveBeenCalledOnce();
    expect(mockedResolveApiKey).not.toHaveBeenCalled();
    expect(MockGeminiProvider).not.toHaveBeenCalled();
    expect(mockedExecuteCodexAnalysis).not.toHaveBeenCalled();
  });

  it('should send again when the persisted result does not satisfy the result contract', async () => {
    const context = mockInput(createAnalyzedData(), { summary: 'Incomplete result' });
    markDelivered(context.getState());
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: createAiResult('Rebuilt result'), warnings: [] });

    const result = await runAi('testuser', {});

    expect(result.status).toBe('success');
    expect(mockSendMessage).toHaveBeenCalledOnce();
  });

  it('should warn when reusing a result based on partial capture data', async () => {
    const context = mockInput(createAnalyzedData(true), createAiResult());
    markDelivered(context.getState());

    const result = await runAi('testuser', {});

    expect(result.status).toBe('skipped');
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('不完整抓取数据'));
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('should resend an unchanged delivered analysis when explicitly requested', async () => {
    const context = mockInput(createAnalyzedData(), createAiResult());
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
    const context = mockInput(createAnalyzedData(), createAiResult());
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

  it('should stop before provider access when delivery preparation cannot be persisted', async () => {
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedUpdateAnalysisState.mockImplementation(() => {
      throw new Error('state unavailable');
    });

    const result = await runAi('testuser', {});

    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'PROVENANCE_UPDATE_FAILED',
    });
    expect(MockGeminiProvider).not.toHaveBeenCalled();
    expect(mockedSaveResultVersion).not.toHaveBeenCalled();
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
    mockedCleanExpiredData.mockReturnValue(noCleanupResult);

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
    expect(mockedSaveResultVersion).toHaveBeenCalledWith(
      'testuser',
      aiResult,
      expect.objectContaining({
        deliveryId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        origin: 'analysis',
        provider: 'gemini',
        model: 'gemini-3.1-pro-preview',
        reasoningLevel: 'high',
        promptHash: request.promptHash,
        dataQuality: 'complete',
        warningCount: 0,
        appVersion: packageJson.version,
      }),
    );
    expect(mockedUpdateAnalysisState).toHaveBeenCalledTimes(3);
    expect(context.getState().currentResult?.deliveryMode).toBe('change');
    expect(context.getState().currentResult?.resultVersionId).toBe('v000001');
    expect(context.getState().pendingResultDelivery).toBeUndefined();
    const [prepareOrder, savedStateOrder, completedStateOrder] =
      mockedUpdateAnalysisState.mock.invocationCallOrder;
    const [saveOrder] = mockedSaveResultVersion.mock.invocationCallOrder;
    if (
      prepareOrder === undefined ||
      savedStateOrder === undefined ||
      completedStateOrder === undefined ||
      saveOrder === undefined
    ) {
      throw new Error('Expected prepared delivery, result version, and provenance writes');
    }
    expect(prepareOrder).toBeLessThan(createSessionOrder);
    expect(sendMessageOrder).toBeLessThan(saveOrder);
    expect(saveOrder).toBeLessThan(savedStateOrder);
    expect(savedStateOrder).toBeLessThan(completedStateOrder);
    expect(mockedCleanExpiredData).toHaveBeenCalledWith('testuser');
    expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining('已保存'));
    expect(result).toMatchObject({
      status: 'success',
      meta: { resultVersionId: 'v000001' },
    });
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

  it('should retain pending delivery when result version persistence fails', async () => {
    const context = mockInput();
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'result' }, warnings: [] });
    mockedSaveResultVersion.mockImplementation(() => {
      throw new Error('disk full');
    });

    const result = await runAi('testuser', {});

    expect(result.reasonCode).toBe('AI_RESULT_WRITE_FAILED');
    expect(mockedUpdateAnalysisState).toHaveBeenCalledOnce();
    expect(context.getState().pendingResultDelivery).toMatchObject({
      resultVersionId: null,
      deliveryMode: 'change',
    });
    expect(context.getState().providers).toBeUndefined();
    expect(mockedCleanExpiredData).not.toHaveBeenCalled();
  });

  it('should stop before writing when provenance changes after provider delivery', async () => {
    const context = mockInput();
    mockedReadAnalysisState
      .mockReturnValueOnce({ status: 'valid', state: context.getState() })
      .mockReturnValue({ status: 'invalid' });
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'result' }, warnings: [] });

    const result = await runAi('testuser', {});

    expect(result.reasonCode).toBe('PROVENANCE_UPDATE_FAILED');
    expect(mockedSaveResultVersion).not.toHaveBeenCalled();
    expect(mockedCleanExpiredData).not.toHaveBeenCalled();
  });

  it('should not clean intermediate files when delivery state persistence fails', async () => {
    const context = mockInput();
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'result' }, warnings: [] });
    mockedUpdateAnalysisState
      .mockImplementationOnce(
        (_username: string, update: (current: AnalysisState) => AnalysisState) =>
          update(context.getState()),
      )
      .mockImplementationOnce(() => {
        throw new Error('state changed');
      });

    const result = await runAi('testuser', {});

    expect(result.reasonCode).toBe('PROVENANCE_UPDATE_FAILED');
    expect(mockedSaveResultVersion).toHaveBeenCalledWith(
      'testuser',
      { summary: 'result' },
      expect.any(Object),
    );
    expect(result.meta).toMatchObject({ resultVersionId: 'v000001' });
    expect(mockedCleanExpiredData).not.toHaveBeenCalled();
  });

  it('should pass CLI model and thinkingLevel options over config values', async () => {
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue({
      systemPrompt: 'prompt',
      promptHash: defaultRequest.promptHash,
      payload: 'payload',
    });
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'r' }, warnings: [] });
    mockedCleanExpiredData.mockReturnValue(noCleanupResult);

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
      promptHash: defaultRequest.promptHash,
      payload: 'payload',
    });
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: { summary: 'r' }, warnings: [] });
    mockedCleanExpiredData.mockReturnValue(noCleanupResult);

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
      promptHash: defaultRequest.promptHash,
      payload: 'payload',
    });
    mockCreateSession.mockRejectedValue(new Error('Auth failed'));

    const result = await runAi('testuser', {});

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('AI 单次分析请求失败'));
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Auth failed'));
    expect(mockedSaveResultVersion).not.toHaveBeenCalled();
    expect(mockedUpdateAnalysisState).toHaveBeenCalledOnce();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(result.reasonCode).toBe('AI_PROVIDER_FAILED');
  });

  it('should reuse the pending Gemini delivery ID after a provider failure', async () => {
    const context = mockInput();
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockCreateSession.mockRejectedValueOnce(new Error('Temporary failure'));

    const first = await runAi('testuser', {});
    const pendingId = context.getState().pendingResultDelivery?.deliveryId;

    expect(first.reasonCode).toBe('AI_PROVIDER_FAILED');
    expect(pendingId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({ data: createAiResult('Retried result'), warnings: [] });

    const second = await runAi('testuser', {});

    expect(second.status).toBe('success');
    expect(mockedSaveResultVersion).toHaveBeenCalledWith(
      'testuser',
      expect.any(Object),
      expect.objectContaining({ deliveryId: pendingId }),
    );
  });

  it('should not persist or clean data when response parsing fails', async () => {
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue({
      systemPrompt: 'prompt',
      promptHash: defaultRequest.promptHash,
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
    expect(mockedSaveResultVersion).not.toHaveBeenCalled();
    expect(mockedUpdateAnalysisState).toHaveBeenCalledOnce();
    expect(mockedCleanExpiredData).not.toHaveBeenCalled();
    expect(result.reasonCode).toBe('AI_PROVIDER_FAILED');
  });

  it('should report failure when the single payload cannot be sent', async () => {
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue({
      systemPrompt: 'prompt',
      promptHash: defaultRequest.promptHash,
      payload: 'payload',
    });
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockRejectedValue(new Error('Request failed'));

    const result = await runAi('testuser', {});

    expect(mockSendMessage).toHaveBeenCalledOnce();
    expect(mockedParseResponse).not.toHaveBeenCalled();
    expect(mockedSaveResultVersion).not.toHaveBeenCalled();
    expect(mockedUpdateAnalysisState).toHaveBeenCalledOnce();
    expect(result.reasonCode).toBe('AI_PROVIDER_FAILED');
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('AI 单次分析请求失败'));
  });

  it('should log warnings from AI response', async () => {
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue({
      systemPrompt: 'prompt',
      promptHash: defaultRequest.promptHash,
      payload: 'payload',
    });
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({
      data: { summary: 'result' },
      warnings: ['Missing field: social'],
    });
    mockedCleanExpiredData.mockReturnValue(noCleanupResult);

    await runAi('testuser', {});

    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Missing field'));
  });

  it('should suppress success detail logs in pipeline mode', async () => {
    mockedResolveApiKey.mockReturnValue('test-api-key');
    mockedBuildAnalysisRequest.mockReturnValue({
      systemPrompt: 'prompt',
      promptHash: defaultRequest.promptHash,
      payload: 'payload',
    });
    mockedWithRetry.mockImplementation((fn: () => unknown) => fn());
    mockCreateSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue('response');
    mockedParseResponse.mockReturnValue({
      data: { summary: 'result' },
      warnings: [],
    });
    mockedCleanExpiredData.mockReturnValue({
      enabled: true,
      retentionDays: 1,
      deleted: ['raw'],
      skipped: [{ type: 'analyzed', reason: 'not_expired' }],
    });

    const result = await runAi('testuser', { pipeline: true });

    expect(result.status).toBe('success');
    expect(result.notices).toMatchObject([
      {
        code: 'DATA_FILES_CLEANED',
        severity: 'warning',
        summary: expect.stringContaining('raw.json'),
      },
    ]);
    expect(mockLogger.warn).not.toHaveBeenCalledWith(expect.stringContaining('DATA_FILES_CLEANED'));
    expect(mockLogger.success).not.toHaveBeenCalled();
    expect(mockLogger.detail).not.toHaveBeenCalledWith(expect.stringContaining('已清理中间数据'));
  });

  it('should commit a Codex result before completing its session state', async () => {
    const input = mockInput();
    const analyzedState = input.getState().analyzed;
    if (!analyzedState) throw new Error('Expected analyzed provenance');
    const complete = vi.fn().mockResolvedValue(undefined);
    let lockHeld = false;
    mockedWithCodexExecutionLock.mockImplementation(
      async (_username: string, operation: () => Promise<unknown>) => {
        lockHeld = true;
        try {
          return await operation();
        } finally {
          lockHeld = false;
        }
      },
    );
    mockedSaveResultVersion.mockImplementation(
      (_username: string, _result: AIAnalysisResult, source: ResultVersionSource) => {
        expect(lockHeld).toBe(true);
        return createSavedMetadata(source);
      },
    );
    complete.mockImplementation(async () => {
      expect(lockHeld).toBe(true);
    });
    mockedGetConfig.mockReturnValue({
      proxy: 'http://config-proxy.example',
      ai: { provider: 'codex', codex: {} },
    });
    mockedExecuteCodexAnalysis.mockResolvedValue({
      status: 'result',
      model: 'gpt-current',
      reasoningEffort: 'high',
      providerKey: CODEX_PROVIDER_KEY,
      localSessionId: 'local-1',
      threadId: 'thread-1',
      threadName: 'testuser-insight',
      result: createAiResult('Codex result'),
      delivery: {
        deliveryId: DELIVERY_ID,
        providerKey: CODEX_PROVIDER_KEY,
        analysisFingerprint: analyzedState.analysisFingerprint,
        payloadHash: analyzedState.payloadHash,
        basedOnPartial: false,
        deliveryMode: 'change',
      },
      complete,
    });

    const output = await runAi('testuser', { provider: 'codex' });

    expect(output).toMatchObject({
      status: 'success',
      meta: { provider: 'codex', model: 'gpt-current', resultVersionId: 'v000001' },
    });
    expect(mockedResolveApiKey).not.toHaveBeenCalled();
    expect(mockedExecuteCodexAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ proxyUrl: 'http://config-proxy.example' }),
    );
    expect(mockedSaveResultVersion).toHaveBeenCalledWith(
      'testuser',
      expect.objectContaining({ summary: 'Codex result' }),
      expect.objectContaining({
        deliveryId: DELIVERY_ID,
        provider: 'codex',
        model: 'gpt-current',
        reasoningLevel: 'high',
        localSessionId: 'local-1',
        externalThreadId: 'thread-1',
        threadName: 'testuser-insight',
      }),
    );
    expect(complete).toHaveBeenCalledOnce();
    expect(lockHeld).toBe(false);
    expect(mockedSaveResultVersion.mock.invocationCallOrder[0]).toBeLessThan(
      complete.mock.invocationCallOrder[0]!,
    );
    expect(input.getState()).toMatchObject({
      providers: {
        [CODEX_PROVIDER_KEY]: {
          lastSentAnalysisFingerprint: analyzedState.analysisFingerprint,
          lastSentPayloadHash: analyzedState.payloadHash,
        },
      },
      currentResult: { resultVersionId: 'v000001' },
    });
    expect(input.getState().pendingResultDelivery).toBeUndefined();
  });

  it('should return busy before Codex runtime access when another process holds the lock', async () => {
    mockedGetConfig.mockReturnValue({ ai: { provider: 'codex', codex: {} } });
    mockedWithCodexExecutionLock.mockRejectedValue(
      new CodexExecutionLockBusyError({
        status: 'locked',
        owner: {
          schemaVersion: 1,
          pid: 42,
          acquiredAt: '2026-07-20T04:00:00.000Z',
          token: 'lock-token',
        },
      }),
    );

    const output = await runAi('testuser', { provider: 'codex' });

    expect(output).toMatchObject({
      status: 'failed',
      reasonCode: 'AI_CODEX_BUSY',
      meta: { lockOwnerPid: 42, lockAcquiredAt: '2026-07-20T04:00:00.000Z' },
    });
    expect(mockedExecuteCodexAnalysis).not.toHaveBeenCalled();
  });

  it('should return busy without persisting or completing a Codex turn', async () => {
    mockedGetConfig.mockReturnValue({ ai: { provider: 'codex', codex: {} } });
    mockedExecuteCodexAnalysis.mockResolvedValue({
      status: 'busy',
      model: 'gpt-current',
      reasoningEffort: 'high',
      providerKey: 'codex:provider-key',
      localSessionId: 'local-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
    });

    const output = await runAi('testuser', { provider: 'codex' });

    expect(output).toMatchObject({ status: 'failed', reasonCode: 'AI_CODEX_BUSY' });
    expect(mockedSaveResultVersion).not.toHaveBeenCalled();
    expect(mockedCleanExpiredData).not.toHaveBeenCalled();
  });

  it('should return Codex-specific recovery for a typed provider failure', async () => {
    mockedGetConfig.mockReturnValue({ ai: { provider: 'codex', codex: {} } });
    mockedExecuteCodexAnalysis.mockRejectedValue(
      new CodexProjectPathError('missing', 'Codex Project directory does not exist'),
    );

    const output = await runAi('testuser', { provider: 'codex' });

    expect(output).toMatchObject({
      status: 'failed',
      reasonCode: 'AI_CODEX_PROJECT_UNAVAILABLE',
      recoverable: true,
    });
    expect(output.recoverActions).toContainEqual(
      expect.objectContaining({ content: 'v2er session check testuser --provider codex' }),
    );
    expect(output.recoverActions).not.toContainEqual(
      expect.objectContaining({ content: expect.stringContaining('config proxy') }),
    );
    expect(mockedSaveResultVersion).not.toHaveBeenCalled();
  });

  it('should preserve a committed Codex result when session completion fails', async () => {
    const input = mockInput();
    const analyzedState = input.getState().analyzed;
    if (!analyzedState) throw new Error('Expected analyzed provenance');
    mockedGetConfig.mockReturnValue({ ai: { provider: 'codex', codex: {} } });
    mockedExecuteCodexAnalysis.mockResolvedValue({
      status: 'result',
      model: 'gpt-current',
      reasoningEffort: 'high',
      providerKey: CODEX_PROVIDER_KEY,
      localSessionId: 'local-1',
      threadId: 'thread-1',
      threadName: 'testuser-insight',
      result: createAiResult('Codex result'),
      delivery: {
        deliveryId: DELIVERY_ID,
        providerKey: CODEX_PROVIDER_KEY,
        analysisFingerprint: analyzedState.analysisFingerprint,
        payloadHash: analyzedState.payloadHash,
        basedOnPartial: false,
        deliveryMode: 'change',
      },
      complete: vi.fn().mockRejectedValue(new Error('registry unavailable')),
    });

    const output = await runAi('testuser', { provider: 'codex' });

    expect(output).toMatchObject({
      status: 'failed',
      reasonCode: 'AI_CODEX_SESSION_UPDATE_FAILED',
      meta: { resultVersionId: 'v000001' },
    });
    expect(mockedSaveResultVersion).toHaveBeenCalledOnce();
    expect(input.getState().pendingResultDelivery).toMatchObject({
      deliveryId: DELIVERY_ID,
      resultVersionId: 'v000001',
    });
    expect(mockedCleanExpiredData).not.toHaveBeenCalled();
  });

  it('should reuse a saved Codex result while completing its accepted turn', async () => {
    const result = createAiResult('Recovered Codex result');
    const input = mockInput(createAnalyzedData(), result);
    const state = input.getState();
    const analyzedState = state.analyzed;
    if (!analyzedState) throw new Error('Expected analyzed provenance');
    setPendingCodexDelivery(state, 'v000001');
    const metadata = createSavedMetadata(
      {
        deliveryId: DELIVERY_ID,
        origin: 'analysis',
        createdAt: '2026-07-26T07:00:00.000Z',
        provider: 'codex',
        model: 'gpt-current',
        reasoningLevel: 'high',
        localSessionId: 'local-1',
        externalThreadId: 'thread-1',
        threadName: 'testuser-insight',
        promptHash: defaultRequest.promptHash,
        analysisFingerprint: analyzedState.analysisFingerprint,
        payloadHash: analyzedState.payloadHash,
        dataQuality: 'complete',
        warningCount: 0,
        appVersion: '0.0.0',
      },
      { resultHash: hashCanonicalJson(result) },
    );
    mockedRecoverResultVersionDelivery.mockReturnValue({
      status: 'recovered',
      metadata,
      result,
    });
    mockedInspectCodexResultDeliverySession.mockReturnValue('pending');
    const complete = vi.fn().mockResolvedValue(undefined);
    mockedGetConfig.mockReturnValue({ ai: { provider: 'codex', codex: {} } });
    mockedExecuteCodexAnalysis.mockResolvedValue({
      status: 'result',
      model: 'gpt-current',
      reasoningEffort: 'high',
      providerKey: CODEX_PROVIDER_KEY,
      localSessionId: 'local-1',
      threadId: 'thread-1',
      threadName: 'testuser-insight',
      result,
      delivery: {
        deliveryId: DELIVERY_ID,
        providerKey: CODEX_PROVIDER_KEY,
        analysisFingerprint: analyzedState.analysisFingerprint,
        payloadHash: analyzedState.payloadHash,
        basedOnPartial: false,
        deliveryMode: 'change',
      },
      complete,
    });

    const output = await runAi('testuser', { provider: 'codex' });

    expect(output).toMatchObject({
      status: 'success',
      meta: { provider: 'codex', resultVersionId: 'v000001' },
    });
    expect(mockedSaveResultVersion).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
    expect(input.getState().pendingResultDelivery).toBeUndefined();
  });
});
