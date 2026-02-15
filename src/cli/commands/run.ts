/**
 * 主命令 `v2er <username>` 入口
 *
 * 职责：
 * 1. 将 Commander 解析的选项转换为 RunWorkflowOptions
 * 2. 调用 orchestrator 执行一键工作流
 * 3. 根据执行结果设置 process.exitCode
 */

import type { ThinkingLevel } from '@/config';
import { logger } from '@/infra/logger';
import type { RunCommandOptions } from '../types';
import { runWorkflow } from '../workflow/orchestrator';
import type { RunWorkflowOptions } from '../workflow/types';

/**
 * 将 Commander 解析的 CLI 选项转化为 orchestrator 所需的类型安全选项。
 *
 * 处理 Commander optional value 的特殊行为：
 * - `--model gemini-2.5-pro` → 直接透传字符串
 * - `--model`（无值）→ Commander 设为 true，此处暂按 undefined 处理（Task 7 接入交互选择）
 */
export function resolveWorkflowOptions(
  username: string,
  options: RunCommandOptions,
): RunWorkflowOptions {
  const model = typeof options.model === 'string' ? options.model : undefined;
  const thinkingLevel: ThinkingLevel | undefined =
    typeof options.thinkingLevel === 'string' ? options.thinkingLevel : undefined;

  return {
    username,
    force: options.force,
    model,
    thinkingLevel,
    verbose: options.verbose,
  };
}

/**
 * `v2er <username>` 主命令执行入口，由 cli/index.ts 注册调用。
 */
export async function runPipeline(username: string, options: RunCommandOptions): Promise<void> {
  try {
    const workflowOptions = resolveWorkflowOptions(username, options);
    const outcome = await runWorkflow(workflowOptions);
    process.exitCode = outcome.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`工作流执行失败: ${message}`);
    process.exitCode = 1;
  }
}
