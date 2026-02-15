import { runAi, runAnalyze, runFetch, runShow } from '../commands';
import type { AiCommandOptions, FetchCommandOptions, ShowCommandOptions } from '../types';
import type { RunOutcome, RunWorkflowOptions, StepRunResult } from './types';

type StepExecutor = () => Promise<StepRunResult>;

interface WorkflowExecutorSet {
  fetch: StepExecutor;
  analyze: StepExecutor;
  ai: StepExecutor;
  show: StepExecutor;
}

/**
 * 构建工作流步骤执行器集合，供编排层按步骤名称调度。
 */
export function buildStepExecutors(options: RunWorkflowOptions): WorkflowExecutorSet {
  const fetchOptions: FetchCommandOptions = {
    force: options.force,
  };
  const aiOptions: AiCommandOptions = {
    model: options.model,
  };
  const showOptions: ShowCommandOptions = {};

  return {
    fetch: () => runFetch(options.username, fetchOptions),
    analyze: () => runAnalyze(options.username),
    ai: () => runAi(options.username, aiOptions),
    show: () => runShow(options.username, showOptions),
  };
}

/**
 * 一键工作流入口。
 * 当前仅提供签名和返回结构占位，执行计划与状态机在下一步接入。
 */
export async function runWorkflow(): Promise<RunOutcome> {
  return {
    overallStatus: 'failed',
    exitCode: 1,
    results: [],
  };
}
