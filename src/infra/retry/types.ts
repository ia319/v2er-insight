/**
 * 重试模块类型定义
 */

/** 重试配置选项（所有字段必填，由调用方从 config 传入） */
export interface RetryOptions {
  /** 最大重试次数（0 = 不重试） */
  maxRetries: number;
  /** 首次重试基础延迟（毫秒） */
  baseDelay: number;
  /** 重试最大延迟上限（毫秒） */
  maxDelay: number;
}
