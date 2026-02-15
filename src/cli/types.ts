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
