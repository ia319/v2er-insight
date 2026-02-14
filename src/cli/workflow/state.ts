import { readDataFile } from '@/infra/storage';
import type { WorkflowState, WorkflowStep } from './types';

/**
 * 检测用户本地工作流产物状态。
 *
 * 这里采用保守策略：当 JSON 解析失败时，`readDataFile` 会返回 `null`，
 * 当前状态会被视为“文件不可用”，避免使用损坏数据继续流程。
 */
export function detectWorkflowState(username: string): WorkflowState {
  const hasRaw = readDataFile<unknown>(username, 'raw') !== null;
  const hasAnalyzed = readDataFile<unknown>(username, 'analyzed') !== null;
  const hasResult = readDataFile<unknown>(username, 'result') !== null;

  return { hasRaw, hasAnalyzed, hasResult };
}

/**
 * 根据当前状态推导入口步骤。
 *
 * 当 `force=true` 时，无条件从 `fetch` 开始执行全流程。
 */
export function resolveEntryStep(state: WorkflowState, force = false): WorkflowStep {
  if (force) return 'fetch';
  if (state.hasResult) return 'show';
  if (state.hasAnalyzed) return 'ai';
  if (state.hasRaw) return 'analyze';
  return 'fetch';
}

/**
 * 根据入口步骤生成线性执行计划。
 * Note: 当前使用 switch 以保证分支语义直观；若后续步骤扩展，
 * 可改为“单一顺序数组 + slice”的数据驱动方式，减少维护点。
 */
export function buildExecutionPlan(entryStep: WorkflowStep): WorkflowStep[] {
  switch (entryStep) {
    case 'fetch':
      return ['fetch', 'analyze', 'ai', 'show'];
    case 'analyze':
      return ['analyze', 'ai', 'show'];
    case 'ai':
      return ['ai', 'show'];
    case 'show':
      return ['show'];
    default:
      return ['fetch', 'analyze', 'ai', 'show'];
  }
}
