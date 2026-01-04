/**
 * CLI 类型定义
 */

/**
 * fetch-user 命令选项
 */
export interface FetchUserOptions {
  /** 仅抓取话题 */
  topics?: boolean;
  /** 仅抓取回复 */
  replies?: boolean;
}
