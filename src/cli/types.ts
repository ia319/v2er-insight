/**
 * CLI 命令选项类型定义
 */

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
  /** TODO: 仅重试上次失败的页面（预留，Phase 1a 暂不实现） */
  retry?: boolean;
}

/**
 * ai 命令选项
 */
export interface AiCommandOptions {
  /** 临时指定模型（不影响全局配置） */
  model?: string;
  /** TODO: 临时指定思考水平（预留，AI 模块尚未实现） */
  thinking?: string;
}

/**
 * show 命令选项
 */
export interface ShowCommandOptions {
  /** 输出原始 JSON */
  json?: boolean;
  /** 简略版输出（仅 summary + 关键指标） */
  brief?: boolean;
}
