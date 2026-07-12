import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowState, WorkflowStep } from '../types';

const mockedExistsSync = vi.hoisted(() => vi.fn());
const mockedGetDataFilePath = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
  existsSync: mockedExistsSync,
}));

vi.mock('@/infra/storage/paths', () => ({
  getDataFilePath: mockedGetDataFilePath,
}));

import { buildExecutionPlan, detectWorkflowState, resolveEntryStep } from '../state';

describe('workflow state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetDataFilePath.mockImplementation(
      (username: string, type: string) => `${username}/${type}.json`,
    );
  });

  it('should detect each workflow artifact independently', () => {
    mockedExistsSync.mockImplementation((filePath: string) => {
      return filePath.endsWith('raw.json') || filePath.endsWith('result.json');
    });

    const state = detectWorkflowState('alice');

    expect(state).toEqual({
      hasRaw: true,
      hasAnalyzed: false,
      hasResult: true,
    });
    expect(mockedGetDataFilePath).toHaveBeenNthCalledWith(1, 'alice', 'raw');
    expect(mockedGetDataFilePath).toHaveBeenNthCalledWith(2, 'alice', 'analyzed');
    expect(mockedGetDataFilePath).toHaveBeenNthCalledWith(3, 'alice', 'result');
  });

  it.each<{
    name: string;
    state: WorkflowState;
    expected: WorkflowStep;
  }>([
    {
      name: 'show when a result exists',
      state: { hasRaw: true, hasAnalyzed: true, hasResult: true },
      expected: 'show',
    },
    {
      name: 'run AI when analyzed data exists',
      state: { hasRaw: true, hasAnalyzed: true, hasResult: false },
      expected: 'ai',
    },
    {
      name: 'analyze when only raw data exists',
      state: { hasRaw: true, hasAnalyzed: false, hasResult: false },
      expected: 'analyze',
    },
    {
      name: 'fetch when no artifact exists',
      state: { hasRaw: false, hasAnalyzed: false, hasResult: false },
      expected: 'fetch',
    },
  ])('should $name', ({ state, expected }) => {
    expect(resolveEntryStep(state)).toBe(expected);
  });

  it('should force the workflow to start with fetch', () => {
    const completeState: WorkflowState = {
      hasRaw: true,
      hasAnalyzed: true,
      hasResult: true,
    };

    expect(resolveEntryStep(completeState, true)).toBe('fetch');
  });

  it.each<{
    entry: WorkflowStep;
    expected: WorkflowStep[];
  }>([
    { entry: 'fetch', expected: ['fetch', 'analyze', 'ai', 'show'] },
    { entry: 'analyze', expected: ['analyze', 'ai', 'show'] },
    { entry: 'ai', expected: ['ai', 'show'] },
    { entry: 'show', expected: ['show'] },
  ])('should build the execution plan from $entry', ({ entry, expected }) => {
    expect(buildExecutionPlan(entry)).toEqual(expected);
  });
});
