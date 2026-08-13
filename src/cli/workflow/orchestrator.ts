import { logger } from '@/infra/logger';
import { runAi, runAnalyze, runFetch, runShow } from '../commands';
import type { AiCommandOptions, FetchCommandOptions, ShowCommandOptions } from '../types';
import { extractErrorDetails } from '../utils/error';
import { renderNotices, renderRecoveryActions } from './notices';
import { buildExecutionPlan, detectWorkflowState, resolveEntryStep } from './state';
import type { RunOutcome, RunWorkflowOptions, StepRunResult, WorkflowStep } from './types';

type StepExecutor = () => Promise<StepRunResult>;
type WorkflowExecutorSet = Record<WorkflowStep, StepExecutor>;

const STEP_LABEL: Record<WorkflowStep, string> = {
  fetch: '抓取',
  analyze: '分析',
  ai: 'AI',
  show: '展示',
};

/**
 * 构建工作流步骤执行器集合，供编排层按步骤名调度。
 */
export function buildStepExecutors(options: RunWorkflowOptions): WorkflowExecutorSet {
  const fetchOptions: FetchCommandOptions = {
    force: options.force,
    pipeline: true,
  };
  const aiOptions: AiCommandOptions = {
    provider: options.provider,
    model: options.model,
    thinkingLevel: options.thinkingLevel,
    reasoningEffort: options.reasoningEffort,
    newThread: options.newThread,
    codexProject: options.codexProject,
    resend: options.resend,
    pipeline: true,
  };
  const showOptions: ShowCommandOptions = {
    pipeline: true,
  };

  return {
    fetch: () => runFetch(options.username, fetchOptions),
    analyze: () => runAnalyze(options.username, { pipeline: true }),
    ai: () => runAi(options.username, aiOptions),
    show: () => runShow(options.username, showOptions),
  };
}

/**
 * 执行一键工作流并聚合步骤结果。
 * @param options 一键工作流入口参数
 * @returns 聚合后的流程执行结果
 */
export async function runWorkflow(options: RunWorkflowOptions): Promise<RunOutcome> {
  const state = detectWorkflowState(options.username);
  const entryStep = resolveEntryStep(state, options.force);
  const plan = buildExecutionPlan(entryStep);
  const executors = buildStepExecutors(options);
  const results: StepRunResult[] = [];

  logger.debug(
    `workflow state: raw=${state.hasRaw}, analyzed=${state.hasAnalyzed}, result=${state.hasResult}`,
  );
  logger.debug(`workflow entry: ${entryStep}`);
  logger.debug(`workflow plan: ${plan.join(' -> ')}`);

  let hasPartial = false;

  for (const [index, step] of plan.entries()) {
    try {
      const result = await executors[step]();
      results.push(result);

      printStepLine(result, index, plan.length);
      if (!result.noticesRendered) renderNotices(result.notices);

      if (result.status === 'partial') {
        hasPartial = true;
        printResultSummary(result);
        continue;
      }

      if (result.status === 'failed') {
        printResultSummary(result);
        return {
          overallStatus: 'failed',
          exitCode: 1,
          failedStep: step,
          results,
        };
      }
    } catch (error) {
      const { message, raw } = extractErrorDetails(error);
      const result: StepRunResult = {
        step,
        status: 'failed',
        reasonCode: 'UNKNOWN_ERROR',
        message: `步骤执行异常: ${message}`,
        meta: {
          rawError: raw,
        },
      };
      results.push(result);
      printStepLine(result, index, plan.length);
      printResultSummary(result);
      return {
        overallStatus: 'failed',
        exitCode: 1,
        failedStep: step,
        results,
      };
    }
  }

  return {
    overallStatus: hasPartial ? 'partial' : 'success',
    exitCode: hasPartial ? 1 : 0,
    results,
  };
}

function printStepLine(result: StepRunResult, index: number, total: number): void {
  const progress = `[${index + 1}/${total}]`;
  const stepLabel = STEP_LABEL[result.step];
  const message = result.message ? ` ${result.message}` : '';

  if (result.status === 'failed') {
    logger.error(`${progress} ${stepLabel}失败${message}`);
    return;
  }

  if (result.status === 'partial') {
    logger.warn(`${progress} ${stepLabel}部分完成${message}`);
    return;
  }

  if (result.status === 'skipped') {
    logger.info(`${progress} ${stepLabel}已跳过${message}`);
    return;
  }

  logger.info(`${progress} ${stepLabel}完成${message}`);
}

function printResultSummary(result: StepRunResult): void {
  if (result.reasonCode) {
    logger.info(`原因码: ${result.reasonCode}`);
  }

  const rawError = result.meta?.rawError;
  if (typeof rawError === 'string') {
    logger.detail(rawError);
  }

  renderRecoveryActions(result.recoverActions);
}
