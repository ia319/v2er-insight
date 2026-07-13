import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { AIAnalysisResult } from '@/core/ai';

const mockedReadDataFile = vi.hoisted(() => vi.fn());
const mockedReadAnalysisState = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('@/infra/storage', () => ({
  readDataFile: mockedReadDataFile,
  readAnalysisState: mockedReadAnalysisState,
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

describe('runShow', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedReadAnalysisState.mockReturnValue({ status: 'missing' });
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should show error when result data is missing', async () => {
    mockedReadDataFile.mockReturnValue(null);

    await runShow('testuser', {});

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('testuser'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('v2er ai'));
  });

  it('should output raw JSON with --json flag', async () => {
    const result = createMockResult();
    mockedReadDataFile.mockReturnValue(result);

    await runShow('testuser', { json: true });

    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it('should return stale and partial notices from valid result provenance', async () => {
    const result = createMockResult();
    mockedReadDataFile.mockReturnValue(result);
    mockedReadAnalysisState.mockReturnValue({
      status: 'valid',
      state: {
        schemaVersion: 1,
        currentResult: {
          analysisFingerprint: 'a'.repeat(64),
          stale: true,
          basedOnPartial: true,
        },
      },
    });

    const outcome = await runShow('testuser', { json: true });

    expect(outcome.notices?.map((notice) => notice.code)).toEqual([
      'DATA_RESULT_STALE',
      'DATA_SNAPSHOT_PARTIAL',
    ]);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it('should display legacy results without guessing provenance notices', async () => {
    mockedReadDataFile.mockReturnValue(createMockResult());
    mockedReadAnalysisState.mockReturnValue({ status: 'invalid' });

    const outcome = await runShow('testuser', {});

    expect(outcome.status).toBe('success');
    expect(outcome.notices).toEqual([]);
  });

  it('should output brief format with --brief flag', async () => {
    mockedReadDataFile.mockReturnValue(createMockResult());

    await runShow('testuser', { brief: true });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('用户画像摘要');
    expect(output).toContain('Full-stack');
    expect(output).toContain('Career growth');
  });

  it('should output full format by default', async () => {
    mockedReadDataFile.mockReturnValue(createMockResult());

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
    mockedReadDataFile.mockReturnValue(createMockResult());

    await runShow('testuser', {});

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('████████░░ 80');
  });

  it('should handle NaN scores gracefully with N/A', async () => {
    const result = createMockResult();
    (result.psychological.scores as Record<string, number>).openness = NaN;
    mockedReadDataFile.mockReturnValue(result);

    await runShow('testuser', {});

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('N/A');
  });

  it('should handle missing array properties gracefully', async () => {
    const result = createMockResult();
    (result.professional as unknown as Record<string, unknown>).tech_stack = undefined;
    (result.personal as unknown as Record<string, unknown>).hobbies = undefined;
    mockedReadDataFile.mockReturnValue(result);

    await expect(runShow('testuser', {})).resolves.not.toThrow();
  });

  it('should display risk level with color coding', async () => {
    mockedReadDataFile.mockReturnValue(
      createMockResult({ risk: { level: 'high_risk', reason: 'Spam detected' } }),
    );

    await runShow('testuser', {});

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('高风险');
    expect(output).toContain('Spam detected');
  });
});
