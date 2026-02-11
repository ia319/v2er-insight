/**
 * 日志配置类型
 */

import type { LogLevel } from '@/infra/logger';

export type { LogLevel };

/** 日志配置 */
export interface LogConfig {
  /** 日志等级 */
  level?: LogLevel;
}
