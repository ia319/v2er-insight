import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { AIAnalysisResult } from '@/core/ai';
import type { ResultVersionSummary, SelectedResult } from '@/infra/storage';

const mockedQueryCurrentResult = vi.hoisted(() => vi.fn());
const mockedQueryResultHistory = vi.hoisted(() => vi.fn());
const mockedQueryResultVersion = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/infra/storage', () => ({
  queryCurrentResult: mockedQueryCurrentResult,
  queryResultHistory: mockedQueryResultHistory,
  queryResultVersion: mockedQueryResultVersion,
}));

vi.mock('@/infra/logger', () => ({
  logger: mockLogger,
}));

import { runShow } from '../show';

/** 创建最小可用的 AIAnalysisResult fixture */
function createMockResult(overrides?: Partial<AIAnalysisResult>): AIAnalysisResult {
  return {
    summary: 'Test summary',
    professional: {
      tech_stack: ['TypeScript', 'Node.js'],
      career_path: 'Full-stack',
      level: 'Senior',
      focus_coherence: 'High',
      evolution: { summary: 'Grew', timeline: [] },
    },
    personal: {
      hobbies: ['coding'],
      life_stage: 'Career growth',
      values: ['efficiency'],
    },
    psychological: {
      scores: {
        openness: 80,
        conscientiousness: 70,
        extraversion: 50,
        agreeableness: 60,
        neuroticism: 30,
      },
      keywords: ['analytical'],
    },
    behavioral: {
      role: 'Contributor',
      interaction_style: 'Constructive',
      active_pattern: 'Weekday',
      heat_sensitivity: 'Low',
    },
    social: {
      content_appeal: 'Technical depth',
      discussion_depth: 'Deep',
    },
    risk: {
      level: 'safe',
      reason: 'Normal activity',
    },
    ...overrides,
  };
}

function createSelection(
  result: AIAnalysisResult,
  overrides: Partial<SelectedResult> = {},
): SelectedResult {
  return {
    username: 'testuser',
    source: 'legacy',
    result,
    metadata: null,
    inputSummary: null,
    archiveState: 'legacy-current',
    provenanceState: 'legacy-missing',
    verifiedCurrentResult: null,
    isCurrent: true,
    ...overrides,
  };
}

function createHistorySummary(versionId = 'v000001'): ResultVersionSummary {
  return {
    versionId,
    sequence: Number(versionId.slice(1)),
    origin: 'analysis',
    createdAt: '2026-08-13T02:00:00.000Z',
    savedAt: '2026-08-13T02:00:01.000Z',
    provider: 'gemini',
    model: 'gemini-test',
    reasoningLevel: 'high',
    sessionName: 'session-1',
    dataQuality: 'complete',
    warningCount: 0,
    inputSummaryAvailable: true,
    isCurrent: true,
    virtual: false,
  };
}

describe('runShow', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedQueryCurrentResult.mockReturnValue({
      status: 'selected',
      selection: createSelection(createMockResult()),
    });
    mockedQueryResultHistory.mockReturnValue({
      status: 'success',
      summaries: [createHistorySummary()],
    });
    mockedQueryResultVersion.mockReturnValue({
      status: 'selected',
      selection: createSelection(createMockResult(), {
        source: 'version',
        archiveState: 'verified-history',
      }),
    });
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should show error when result data is missing', async () => {
    mockedQueryCurrentResult.mockReturnValue({ status: 'missing', latestVersionId: null });

    const outcome = await runShow('testuser', {});

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('testuser'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('v2er ai'));
    expect(outcome.reasonCode).toBe('SHOW_RESULT_MISSING');
  });

  it('should direct a missing current result to its verified archive', async () => {
    mockedQueryCurrentResult.mockReturnValue({
      status: 'missing',
      latestVersionId: 'v000003',
    });

    const outcome = await runShow('testuser', {});

    expect(outcome.recoverActions?.map(({ content }) => content)).toEqual([
      'v2er show testuser --history',
      'v2er show testuser --version v000003',
    ]);
  });

  it('should reject a result that does not satisfy the persisted contract', async () => {
    mockedQueryCurrentResult.mockReturnValue({ status: 'invalid', reason: 'contract' });

    const outcome = await runShow('testuser', {});

    expect(outcome.reasonCode).toBe('SHOW_RESULT_INVALID');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should output raw JSON with --json flag', async () => {
    const result = createMockResult();
    mockedQueryCurrentResult.mockReturnValue({
      status: 'selected',
      selection: createSelection(result),
    });

    await runShow('testuser', { json: true });

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it('should return stale and partial notices from valid result provenance', async () => {
    const result = createMockResult();
    mockedQueryCurrentResult.mockReturnValue({
      status: 'selected',
      selection: createSelection(result, {
        source: 'current',
        archiveState: 'verified-current',
        provenanceState: 'verified',
        verifiedCurrentResult: {
          analysisFingerprint: 'a'.repeat(64),
          stale: true,
          basedOnPartial: true,
          deliveryMode: 'change',
          resultVersionId: 'v000001',
        },
      }),
    });

    const outcome = await runShow('testuser', { json: true });

    expect(outcome.notices?.map((notice) => notice.code)).toEqual([
      'DATA_RESULT_STALE',
      'DATA_SNAPSHOT_PARTIAL',
    ]);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it('should identify a legacy result without guessing provenance', async () => {
    const outcome = await runShow('testuser', {});

    expect(outcome.status).toBe('success');
    expect(outcome.notices?.map((notice) => notice.code)).toEqual(['RESULT_LEGACY_CURRENT']);
  });

  it('should stop when the result snapshot keeps changing', async () => {
    mockedQueryCurrentResult.mockReturnValue({ status: 'busy' });

    const outcome = await runShow('testuser', {});

    expect(outcome.reasonCode).toBe('RESULT_VERSION_BUSY');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should reject conflicting options before starting a query', async () => {
    const invalidOptions = [
      { json: true, brief: true },
      { history: true, brief: true },
      { history: true, version: 'v000001' },
    ];
    for (const options of invalidOptions) {
      expect((await runShow('testuser', options)).reasonCode).toBe(
        'SHOW_INVALID_OPTION_COMBINATION',
      );
    }
    expect(mockedQueryCurrentResult).not.toHaveBeenCalled();
    expect(mockedQueryResultHistory).not.toHaveBeenCalled();
    expect(mockedQueryResultVersion).not.toHaveBeenCalled();
  });

  it('should output stable history summaries as JSON or a table', async () => {
    const summaries = [
      createHistorySummary('v000002'),
      { ...createHistorySummary('v000001'), isCurrent: false },
    ];
    mockedQueryResultHistory.mockReturnValue({ status: 'success', summaries });

    await runShow('testuser', { history: true, json: true });
    expect(consoleSpy).toHaveBeenLastCalledWith(JSON.stringify(summaries, null, 2));

    consoleSpy.mockClear();
    await runShow('testuser', { history: true });
    const output = consoleSpy.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(output).toContain('结果版本历史');
    expect(output).toContain('v000002');
    expect(output).toContain('Provider');
  });

  it('should display the selected immutable version without querying current', async () => {
    const result = createMockResult({ summary: 'Archived result' });
    mockedQueryResultVersion.mockReturnValue({
      status: 'selected',
      selection: createSelection(result, {
        source: 'version',
        archiveState: 'verified-history',
      }),
    });

    await runShow('testuser', { version: 'v000002', json: true });

    expect(mockedQueryResultVersion).toHaveBeenCalledWith('testuser', 'v000002');
    expect(mockedQueryCurrentResult).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it('should map empty, missing-version, and corrupt archives to stable reasons', async () => {
    mockedQueryResultHistory.mockReturnValue({ status: 'empty' });
    expect((await runShow('testuser', { history: true })).reasonCode).toBe('SHOW_HISTORY_EMPTY');

    mockedQueryResultVersion.mockReturnValue({ status: 'not-found' });
    const missingVersion = await runShow('testuser', { version: 'v000009' });
    expect(missingVersion.reasonCode).toBe('SHOW_VERSION_NOT_FOUND');
    expect(missingVersion.recoverActions?.[0]?.content).toBe('v2er show testuser --history');

    mockedQueryResultHistory.mockReturnValue({ status: 'corrupt', reason: 'mismatched' });
    expect((await runShow('testuser', { history: true })).reasonCode).toBe(
      'RESULT_VERSION_CORRUPT',
    );
  });

  it('should output brief format with --brief flag', async () => {
    await runShow('testuser', { brief: true });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('用户画像摘要');
    expect(output).toContain('Full-stack');
    expect(output).toContain('Career growth');
  });

  it('should output full format by default', async () => {
    await runShow('testuser', {});

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('用户画像分析');
    expect(output).toContain('职业画像');
    expect(output).toContain('个人生活');
    expect(output).toContain('心理画像');
    expect(output).toContain('行为画像');
    expect(output).toContain('风险评估');
  });

  it('should render OCEAN score bars in full output', async () => {
    await runShow('testuser', {});

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('████████░░ 80');
  });

  it('should display risk level with color coding', async () => {
    const result = createMockResult({ risk: { level: 'high_risk', reason: 'Spam detected' } });
    mockedQueryCurrentResult.mockReturnValue({
      status: 'selected',
      selection: createSelection(result),
    });

    await runShow('testuser', {});

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('高风险');
    expect(output).toContain('Spam detected');
  });
});
