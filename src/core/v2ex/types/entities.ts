/**
 * V2EX 实体类型
 * 定义基本的数据结构
 */

/**
 * 单条用户回复
 * 来源：/member/{username}/replies 页面中的单个回复项
 */
export interface V2exReply {
  /** Stable reply identity derived from the topic URL and reply anchor. */
  replyId: string | null;
  /** Stable topic identity derived from `/t/{id}`. */
  topicId: string | null;
  /** Reply floor number derived from `#reply{N}`. */
  replyNumber: number | null;
  /** 主题标题 */
  topicTitle: string;
  /** 节点名称 */
  nodeName: string;
  /** 回复时间（相对时间或具体日期） */
  replyTime: string;
  /** 回复内容（纯文本） */
  content: string;
  /** 是否直接回复主帖 */
  isDirectReply: boolean;
  /** 回复对象用户名，直接回复主帖时为 null */
  replyTo: string | null;
}

/**
 * 帖子详情
 * 来源：/t/{topic_id} 页面
 */
export interface V2exTopicDetail {
  /** Stable topic identity derived from `/t/{id}`. */
  topicId: string;
  /** Canonical source URL for the topic. */
  sourceUrl: string;
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
