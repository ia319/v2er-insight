/**
 * CLI 命令选项类型定义
 */

import type { ThinkingLevel } from '@/config';

/**
 * fetch 命令选项
 */
export interface FetchCommandOptions {
  /** 仅抓取话题 */
  topics?: boolean;
  /** 仅抓取回复 */
  replies?: boolean;
  /** 强制重新抓取，忽略缓存 */
  force?: boolean;
  /** 由一键流程触发时开启，供命令控制日志粒度 */
  pipeline?: boolean;
}

/**
 * ai 命令选项
 */
export interface AiCommandOptions {
  /** 临时指定模型（不影响全局配置） */
  model?: string;
  /** 临时覆盖思考等级（不影响全局配置） */
  thinkingLevel?: ThinkingLevel;
  /** 由一键流程触发时开启，供命令控制日志粒度 */
  pipeline?: boolean;
}

/**
 * show 命令选项
 */
export interface ShowCommandOptions {
  /** 输出原始 JSON */
  json?: boolean;
  /** 简略版输出（仅 summary + 关键指标） */
  brief?: boolean;
  /** 由一键流程触发时开启，供命令控制日志粒度 */
  pipeline?: boolean;
}

/**
 * 主命令 `v2er <username>` 选项
 *
 * Commander 将 --model [name] 解析为 string | true：
 * - `--model gemini-2.5-pro` → model = 'gemini-2.5-pro'
 * - `--model`（无值）→ model = true（触发交互选择）
 * --thinking-level 同理。
 */
export interface RunCommandOptions {
  /** 强制重新抓取，忽略缓存 */
  force?: boolean;
  /** 临时指定模型，或 true 表示触发交互选择 */
  model?: string | true;
  /** 临时覆盖思考等级，或 true 表示触发交互选择 */
  thinkingLevel?: ThinkingLevel | true;
  /** 显示 debug 级别日志 */
  verbose?: boolean;
}
