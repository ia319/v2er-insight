import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepRunResult, WorkflowStep } from '../types';

const mockRunFetch = vi.hoisted(() => vi.fn());
const mockRunAnalyze = vi.hoisted(() => vi.fn());
const mockRunAi = vi.hoisted(() => vi.fn());
const mockRunShow = vi.hoisted(() => vi.fn());

const mockDetectWorkflowState = vi.hoisted(() => vi.fn());
const mockResolveEntryStep = vi.hoisted(() => vi.fn());
const mockBuildExecutionPlan = vi.hoisted(() => vi.fn());

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  detail: vi.fn(),
}));

vi.mock('../../commands', () => ({
  runFetch: mockRunFetch,
  runAnalyze: mockRunAnalyze,
  runAi: mockRunAi,
  runShow: mockRunShow,
}));

vi.mock('../state', () => ({
  detectWorkflowState: mockDetectWorkflowState,
  resolveEntryStep: mockResolveEntryStep,
  buildExecutionPlan: mockBuildExecutionPlan,
}));

vi.mock('@/infra/logger', () => ({
  logger: mockLogger,
}));

import { runWorkflow } from '../orchestrator';

function makeResult(step: WorkflowStep, status: StepRunResult['status']): StepRunResult {
  return { step, status };
}

describe('runWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectWorkflowState.mockReturnValue({
      hasRaw: false,
      hasAnalyzed: false,
      hasResult: false,
    });
    mockResolveEntryStep.mockReturnValue('fetch');
    mockBuildExecutionPlan.mockReturnValue(['fetch', 'analyze', 'ai', 'show']);
  });

  it('returns success when all steps succeed', async () => {
    mockRunFetch.mockResolvedValue(makeResult('fetch', 'success'));
    mockRunAnalyze.mockResolvedValue(makeResult('analyze', 'success'));
    mockRunAi.mockResolvedValue(makeResult('ai', 'success'));
    mockRunShow.mockResolvedValue(makeResult('show', 'success'));

    const outcome = await runWorkflow({
      username: 'alice',
      force: true,
      model: 'gemini-2.0-flash',
      thinkingLevel: 'high',
      resend: true,
    });

    expect(outcome.overallStatus).toBe('success');
    expect(outcome.exitCode).toBe(0);
    expect(outcome.results).toHaveLength(4);
    expect(mockRunFetch).toHaveBeenCalledWith('alice', { force: true, pipeline: true });
    expect(mockRunAnalyze).toHaveBeenCalledWith('alice', { pipeline: true });
    expect(mockRunAi).toHaveBeenCalledWith('alice', {
      model: 'gemini-2.0-flash',
      thinkingLevel: 'high',
      resend: true,
      pipeline: true,
    });
    expect(mockRunShow).toHaveBeenCalledWith('alice', { pipeline: true });
  });

  it('continues after partial and returns partial outcome', async () => {
    mockRunFetch.mockResolvedValue({
      step: 'fetch',
      status: 'partial',
      reasonCode: 'FETCH_PARTIAL_FAILED',
      recoverActions: [],
    });
    mockRunAnalyze.mockResolvedValue(makeResult('analyze', 'success'));
    mockRunAi.mockResolvedValue(makeResult('ai', 'success'));
    mockRunShow.mockResolvedValue(makeResult('show', 'success'));

    const outcome = await runWorkflow({ username: 'alice' });

    expect(outcome.overallStatus).toBe('partial');
    expect(outcome.exitCode).toBe(1);
    expect(outcome.results).toHaveLength(4);
    expect(mockRunAnalyze).toHaveBeenCalled();
    expect(mockRunAi).toHaveBeenCalled();
    expect(mockRunShow).toHaveBeenCalled();
  });

  it('stops on failed step and returns failed outcome', async () => {
    mockRunFetch.mockResolvedValue(makeResult('fetch', 'success'));
    mockRunAnalyze.mockResolvedValue({
      step: 'analyze',
      status: 'failed',
      reasonCode: 'ANALYZE_FAILED',
      recoverActions: [],
    });

    const outcome = await runWorkflow({ username: 'alice' });

    expect(outcome.overallStatus).toBe('failed');
    expect(outcome.exitCode).toBe(1);
    expect(outcome.failedStep).toBe('analyze');
    expect(outcome.results).toHaveLength(2);
    expect(mockRunAi).not.toHaveBeenCalled();
    expect(mockRunShow).not.toHaveBeenCalled();
  });

  it('converts thrown step error to structured failed outcome', async () => {
    mockRunFetch.mockResolvedValue(makeResult('fetch', 'success'));
    mockRunAnalyze.mockRejectedValue(new Error('network broke'));

    const outcome = await runWorkflow({ username: 'alice' });

    expect(outcome.overallStatus).toBe('failed');
    expect(outcome.exitCode).toBe(1);
    expect(outcome.failedStep).toBe('analyze');
    expect(outcome.results).toHaveLength(2);
    expect(outcome.results[1]).toMatchObject({
      step: 'analyze',
      status: 'failed',
      reasonCode: 'UNKNOWN_ERROR',
    });
    expect(outcome.results[1]?.message).toContain('network broke');
    expect(mockRunAi).not.toHaveBeenCalled();
    expect(mockRunShow).not.toHaveBeenCalled();
  });

  it('does not halt on skipped steps and returns success', async () => {
    mockRunFetch.mockResolvedValue(makeResult('fetch', 'skipped'));
    mockRunAnalyze.mockResolvedValue(makeResult('analyze', 'success'));
    mockRunAi.mockResolvedValue(makeResult('ai', 'success'));
    mockRunShow.mockResolvedValue(makeResult('show', 'success'));

    const outcome = await runWorkflow({ username: 'alice' });

    expect(outcome.overallStatus).toBe('success');
    expect(outcome.exitCode).toBe(0);
    expect(outcome.results).toHaveLength(4);
    expect(mockRunAnalyze).toHaveBeenCalled();
    expect(mockRunAi).toHaveBeenCalled();
    expect(mockRunShow).toHaveBeenCalled();
  });
});
