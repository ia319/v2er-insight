import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunCommandOptions } from '@/cli/types';

const mockRunWorkflow = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  setLevel: vi.fn(),
}));

vi.mock('../../workflow/orchestrator', () => ({
  runWorkflow: mockRunWorkflow,
}));

vi.mock('@/infra/logger', () => ({
  logger: mockLogger,
}));

import { resolveWorkflowOptions, runPipeline } from '../run';

describe('resolveWorkflowOptions', () => {
  it('should pass through explicit model and thinking level', () => {
    const options: RunCommandOptions = {
      force: true,
      model: 'gemini-2.5-pro',
      thinkingLevel: 'high',
      verbose: true,
    };

    const result = resolveWorkflowOptions('alice', options);

    expect(result).toEqual({
      username: 'alice',
      force: true,
      model: 'gemini-2.5-pro',
      thinkingLevel: 'high',
      verbose: true,
    });
  });

  it('should treat commander optional-value true as undefined', () => {
    const options: RunCommandOptions = {
      model: true,
      thinkingLevel: true,
    };

    const result = resolveWorkflowOptions('alice', options);

    expect(result.model).toBeUndefined();
    expect(result.thinkingLevel).toBeUndefined();
  });
});

describe('runPipeline', () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterAll(() => {
    process.exitCode = originalExitCode;
  });

  it('should call runWorkflow and set process.exitCode from outcome', async () => {
    mockRunWorkflow.mockResolvedValue({
      overallStatus: 'partial',
      exitCode: 1,
      results: [],
    });

    await runPipeline('alice', {
      force: true,
      model: 'gemini-2.0-flash',
      thinkingLevel: 'medium',
      verbose: true,
    });

    expect(mockRunWorkflow).toHaveBeenCalledWith({
      username: 'alice',
      force: true,
      model: 'gemini-2.0-flash',
      thinkingLevel: 'medium',
      verbose: true,
    });
    expect(mockLogger.setLevel).toHaveBeenCalledWith('debug');
    expect(process.exitCode).toBe(1);
  });

  it('should set exitCode=1 and log error when workflow throws', async () => {
    mockRunWorkflow.mockRejectedValue(new Error('unexpected boom'));

    await runPipeline('alice', {});

    expect(mockLogger.setLevel).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('unexpected boom'));
  });
});
