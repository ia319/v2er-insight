/**
 * Analyzer 模块配置类型
 */

/** Analyzer 模块配置 */
export interface AnalyzerConfig {
  /** 暂停期检测阈值（天） */
  inactivityThreshold?: number;
  /** 单片最大帖子数 */
  chunkMaxTopics?: number;
  /** 单片最大回复数 */
  chunkMaxReplies?: number;
  /** 节点分布 Top N */
  nodeDistributionTopN?: number;
}
