/**
 * 配置类型 — 统一导出
 *
 * 每个模块的配置拆分为独立文件，方便阅读和按需引用。
 */

export type { AIConfig, ThinkingLevel } from './ai';
export type { FetchConfig } from './fetch';
export type { AnalyzerConfig } from './analyzer';
export type { DataConfig } from './data';
export type { LogConfig, LogLevel } from './log';

import type { AIConfig } from './ai';
import type { FetchConfig } from './fetch';
import type { AnalyzerConfig } from './analyzer';
import type { DataConfig } from './data';
import type { LogConfig } from './log';

/** 全局配置接口 */
export interface V2erConfig {
  /** 代理服务器地址（如 http://127.0.0.1:10808） */
  proxy?: string;
  /** AI 模块配置 */
  ai?: AIConfig;
  /** Fetcher 模块配置 */
  fetch?: FetchConfig;
  /** Analyzer 模块配置 */
  analyzer?: AnalyzerConfig;
  /** 数据管理配置 */
  data?: DataConfig;
  /** 日志配置 */
  log?: LogConfig;
}
