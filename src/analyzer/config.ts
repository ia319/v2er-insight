/**
 * Analyzer 配置常量
 */

export const ANALYZER_CONFIG = {
  /** 暂停期阈值（天） */
  INACTIVITY_THRESHOLD_DAYS: 60,

  /** 分片阈值 */
  CHUNK_MAX_TOPICS: 20,
  CHUNK_MAX_REPLIES: 100,

  /** 节点分布 Top N */
  NODE_DISTRIBUTION_TOP_N: 3,
} as const;
