/**
 * Analyzer 输出数据结构
 *
 * 设计思路：
 * 1. UserOverview 用户总览（全局信息）
 * 2. PeriodsSummary 包含所有活跃期的统计分析结果（一次性发送）
 * 3. PeriodContent 按活跃期分片发送
 * 4. 关键规则：不同活跃期必须分 chunk（同一 chunk 只能包含同一活跃期的内容）
 *
 * 发送策略：
 * 1. 先发送 UserOverview → AI 获得用户基本画像
 * 2. 发送 PeriodsSummary → AI 获得所有活跃期的统计概览
 * 3. 再按需发送各活跃期的内容：
 *    - 活跃期 0 内容少 → 发送 PeriodContent(periodIndex=0)
 *    - 活跃期 1 内容多 → 发送 PeriodContentChunk(periodIndex=1, chunkIndex=0)
 *                     → 发送 PeriodContentChunk(periodIndex=1, chunkIndex=1)
 *                     → ...
 */

// ============================================================================
// 用户总览 (User Overview) - 目标用户的全局信息
// ============================================================================

/**
 * 用户总览
 * 在提示词后首先发送给 AI，描述目标用户的基本信息
 */
export interface UserOverview {
  /** 加入时间，格式：2010-04-25 21:45:46 +08:00 */
  joinDate: string;
  /**
   * 最后活动时间
   * 取最后发帖时间和最后回复时间中较晚的一个
   */
  lastActiveTime: string;
  /**
   * 发帖与回复量比率
   * 计算方式：totalTopics / totalReplies
   * 高 = 偏向发起话题；低 = 偏向参与讨论
   */
  topicReplyRatio: number;
  /** 总发帖数 */
  totalTopics: number;
  /** 总回复数 */
  totalReplies: number;
  /**
   * 是否隐藏主题列表
   * true = 用户主动隐藏了发帖记录
   */
  isTopicsHidden: boolean;
  /**
   * 今日活跃度排名
   * null = 用户今天不活跃或未显示
   */
  dailyRanking: number | null;
}

// ============================================================================
// 单个活跃期的统计结果
// ============================================================================

/**
 * 单个活跃期的统计指标
 */
export interface SinglePeriodStats {
  /** 时间范围，格式："2015-04-01 to 2017-08-15" */
  timeRange: string;

  // -------------------------
  // 帖子统计
  // -------------------------

  /** 本活跃期内帖子数量 */
  topicCount: number;
  /** 平均回复数 - 衡量内容影响力 */
  avgTopicReplyCount: number;
  /** 平均点击数 - 衡量话题吸引力 */
  avgTopicClickCount: number;
  /**
   * 平均帖子生命周期（天）
   * 计算方式：Avg(lastReplyTime - createdAt)
   */
  avgTopicLifecycleDays: number;
  /**
   * 回复/点击转化率
   * 计算方式：Sum(replyCount) / Sum(clickCount)
   */
  topicInteractionRatio: number;
  /**
   * 帖子发布时间分布 (0-23 小时)
   */
  topicHourDistribution: Record<number, number>;
  /**
   * 帖子发布节点前三
   * nodeName -> 数量，按数量降序排列
   */
  topicNodeDistribution: Record<string, number>;

  // -------------------------
  // 回复统计
  // -------------------------

  /** 本活跃期内回复数量 */
  replyCount: number;
  /** 平均回复长度（字符数） */
  avgReplyLength: number;
  /**
   * 直接回复率
   * 计算方式：直接回复主帖的数量 / 总回复数
   * 高 = 主动发起讨论；低 = 倾向于跟帖互动
   */
  directReplyRatio: number;
  /**
   * 参与话题的平均热度
   * 计算方式：Avg(topicReplyCount)
   * 高 = 追热点；低 = 关注小众话题
   */
  avgRepliedTopicHeat: number;
  /**
   * 回复星期分布（百分比）
   * 通过相对时间（如"3天前"）计算星期几
   * 示例：{ "周一": 0.20, "周五": 0.15, ... }
   * 如果无法计算则为 null
   */
  replyWeekdayDistribution: Record<string, number> | null;
  /**
   * 回复节点分布（前 3 个）
   * nodeName -> 数量，按数量降序排列
   */
  replyNodeDistribution: Record<string, number>;
}

// ============================================================================
// 所有活跃期的统计汇总
// ============================================================================

/**
 * 所有活跃期的统计汇总
 * 一次性发送，让 AI 看到全局概览
 */
export interface PeriodsSummary {
  /** 总活跃期数 */
  totalPeriods: number;
  /**
   * 各活跃期的统计数据
   * 索引 = 活跃期序号 (从 0 开始)
   */
  periods: SinglePeriodStats[];
}

// ============================================================================
// 活跃期内容
// ============================================================================

/**
 * 发送给 AI 的单条帖子
 */
export interface ContentTopic {
  /** 主题标题 - 用于分析关注话题和表达风格 */
  title: string;
  /** 节点名称 - 用于分析专业领域和兴趣分布 */
  nodeName: string;
  /** 主题内容 - 用于分析写作风格和思维深度 */
  content: string;
}

/**
 * 发送给 AI 的单条回复
 */
export interface ContentReply {
  /** 回复所在的主题标题 - 用于分析关注的话题类型 */
  topicTitle: string;
  /** 节点名称 - 用于分析活跃领域 */
  nodeName: string;
  /** 回复内容 - 用于分析表达风格和情感倾向 */
  content: string;
}

/**
 * 活跃期内容（完整版）
 * 当内容量小于阈值时使用
 */
export interface PeriodContent {
  /** 活跃期序号 - 对应 PeriodsSummary.periods[periodIndex] */
  periodIndex: number;
  /** 帖子列表 */
  topics: ContentTopic[];
  /** 回复列表 */
  replies: ContentReply[];
}

/**
 * 活跃期内容分片
 * 当单个活跃期内容过多时（帖子>20 或 回复>100），分片发送
 * 关键规则：同一 chunk 只能包含同一活跃期的内容
 */
export interface PeriodContentChunk {
  /** 活跃期序号 - 对应 PeriodsSummary.periods[periodIndex] */
  periodIndex: number;
  /** 分片序号 (从 0 开始) */
  chunkIndex: number;
  /** 本活跃期总分片数 */
  totalChunksInPeriod: number;
  /** 帖子列表 */
  topics: ContentTopic[];
  /** 回复列表 */
  replies: ContentReply[];
}

// ============================================================================
// 最终输出结构
// ============================================================================

/**
 * Analyzer 模块的最终输出
 */
export interface AnalyzerOutput {
  /** 所有活跃期的统计汇总（一次性发送） */
  summary: PeriodsSummary;
  /**
   * 各活跃期的内容
   * 可能是完整内容(PeriodContent)或分片(PeriodContentChunk)
   * 发送时按 periodIndex 顺序发送
   */
  contents: Array<PeriodContent | PeriodContentChunk>;
}

// ============================================================================
// AI 关联说明
// ============================================================================
/**
 * AI 如何关联活跃期与内容：
 *
 * 1. AI 首先收到 PeriodsSummary，了解到共有 N 个活跃期及其统计数据
 * 2. AI 逐个收到 PeriodContent/PeriodContentChunk
 * 3. 每个内容都有 periodIndex 字段，明确标识属于哪个活跃期
 * 4. AI 可以通过 periodIndex 将内容与 summary.periods[periodIndex] 对应
 *
 * 示例发送序列：
 *   → PeriodsSummary { totalPeriods: 3, periods: [stats0, stats1, stats2] }
 *   → PeriodContent { periodIndex: 0, topics: [...], replies: [...] }
 *   → PeriodContentChunk { periodIndex: 1, chunkIndex: 0, totalChunksInPeriod: 2, ... }
 *   → PeriodContentChunk { periodIndex: 1, chunkIndex: 1, totalChunksInPeriod: 2, ... }
 *   → PeriodContent { periodIndex: 2, topics: [...], replies: [...] }
 *
 * AI 可以清晰地知道：
 * - 活跃期 0 (stats0)：1 个完整内容包
 * - 活跃期 1 (stats1)：2 个分片，需要合并理解
 * - 活跃期 2 (stats2)：1 个完整内容包
 */
