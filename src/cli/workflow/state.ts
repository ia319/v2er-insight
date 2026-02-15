import { existsSync } from 'fs';
import { getDataFilePath } from '@/infra/storage/paths';
import type { WorkflowState, WorkflowStep } from './types';

/**
 * 检测用户本地工作流产物状态。
 *
 * 这里只做“文件是否存在”的轻量判断，不读取和解析 JSON 内容。
 * 具体的数据缺失或结构错误由各步骤命令自行处理并返回 reasonCode。
 */
export function detectWorkflowState(username: string): WorkflowState {
  const hasRaw = existsSync(getDataFilePath(username, 'raw'));
  const hasAnalyzed = existsSync(getDataFilePath(username, 'analyzed'));
  const hasResult = existsSync(getDataFilePath(username, 'result'));

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
