/**
 * Analyzer 输出数据结构
 *
 * 结构组成：
 * 1. UserOverview：用户全局信息
 * 2. PeriodsSummary：所有活跃期的统计结果
 * 3. PeriodContent / PeriodContentChunk：按活跃期组织的内容
 * 4. AnalyzerOutput：上述结构组成的单个完整 JSON
 *
 * 单个 chunk 对应一个活跃期。periodIndex 关联统计周期与内容，chunkIndex
 * 表示同一活跃期内的分片顺序。
 */

// ============================================================================
// 用户总览 (User Overview) - 目标用户的全局信息
// ============================================================================

/**
 * 目标用户的基本信息和全局指标
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
   * null = 主题隐藏、帖子或回复未请求，或没有回复
   */
  topicReplyRatio: number | null;
  /** 总发帖数，null = 隐藏主题列表或未请求帖子 */
  totalTopics: number | null;
  /** 总回复数，null = 未请求回复 */
  totalReplies: number | null;
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
   * null = 当前活跃期没有可用的话题回复总数
   */
  avgRepliedTopicHeat: number | null;
  /**
   * 回复星期分布（全部 7 天，百分比）
   * 通过相对时间（如"3天前"）计算星期几
   * 示例：{ "周一": 0.20, "周二": 0.15, ... }
   * 无活动的天返回 0，如果无法计算则为 null
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
 * Analyzer 内容中的单条帖子
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
 * Analyzer 内容中的单条回复
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
 * 单个活跃期内容超过阈值（帖子>20 或 回复>100）时采用分片结构
 * 单个 chunk 对应一个活跃期
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

export type SnapshotStatus = 'complete' | 'partial' | 'not_requested';

export interface SnapshotQuality {
  status: SnapshotStatus;
  totalExpected: number | null;
  fetchedCount: number;
  /** 已知缺失、无效或与声明总数不一致的条数 */
  failedCount: number;
}

/**
 * Analyzer 模块的最终输出
 */
export interface AnalyzerOutput {
  /** Analyzer 输出协议版本 */
  schemaVersion: 2;
  /** 本次抓取的数据完整性 */
  dataQuality: {
    capturedAt: string;
    topics: SnapshotQuality;
    replies: SnapshotQuality;
  };
  /** 用户总览 */
  userOverview: UserOverview;
  /** 所有活跃期的统计汇总 */
  summary: PeriodsSummary;
  /**
   * 各活跃期的内容
   * 可能是完整内容(PeriodContent)或分片(PeriodContentChunk)
   * 按 periodIndex 排列，同一活跃期的分片按 chunkIndex 排列
   */
  contents: Array<PeriodContent | PeriodContentChunk>;
}

// ============================================================================
// AnalyzerOutput 关联结构
// ============================================================================
/**
 * AnalyzerOutput 采用单个完整 JSON。
 * dataQuality 表示数据范围完整性。
 * periodIndex 是内容与统计周期的关联键；同一值对应一个活跃期及其多个 chunk。
 */
