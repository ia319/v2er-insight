/**
 * V2EX 解析结果类型
 * 定义解析器返回的数据结构
 */

import type { V2exReply } from './entities';

/**
 * 用户主页解析结果
 * 来源：/member/{username}
 */
export interface UserProfileParseResult {
  /** 今日活跃度排名，null 表示未显示 */
  dailyRanking: number | null;
  /** 加入时间，格式：2010-04-25 21:45:46 +08:00 */
  joinDate: string;
}

/**
 * 回复列表页解析结果
 * 来源：/member/{username}/replies?p={page}
 */
export interface RepliesPageParseResult {
  /** Declared total reply count, or `null` when the page omits it. */
  totalReplies: number | null;
  /** Number of replies without a stable source anchor. */
  invalidReplyCount: number;
  /** 本页回复列表 */
  replies: V2exReply[];
  /** 当前页码 */
  currentPage: number;
  /** 总页数 */
  totalPages: number;
}

/**
 * 发帖列表页解析结果
 * 来源：/member/{username}/topics?p={page}
 */
export interface TopicsPageParseResult {
  /** 是否被用户隐藏 */
  isHidden: boolean;
  /** Number of links without a stable topic ID. */
  invalidTopicCount: number;
  /** 本页帖子 URL 列表 */
  topicUrls: string[];
  /** 当前页码 */
  currentPage: number;
  /** 总页数 */
  totalPages: number;
}

/**
 * 单个帖子页面解析结果
 * 来源：/t/{topic_id}
 */
export interface TopicDetailParseResult {
  /** 主题标题 */
  title: string;
  /** 节点名称 */
  nodeName: string;
  /** 发布时间（绝对时间） */
  createdAt: string;
  /** 主题内容 */
  content: string;
  /** 该帖子的回复总数 */
  replyCount: number;
  /** 最后回复时间，无回复时为 null */
  lastReplyTime: string | null;
  /** 点击次数 */
  clickCount: number;
}
