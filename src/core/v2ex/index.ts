/**
 * V2EX 模块公共导出
 * 提供 V2EX 业务相关的类型、URL 生成和 HTML 解析功能
 */

// 类型导出
export type {
  V2exReply,
  V2exTopicDetail,
  UserProfileParseResult,
  RepliesPageParseResult,
  TopicsPageParseResult,
  TopicDetailParseResult,
} from './types';

// URL 生成器导出
export {
  getUserProfileUrl,
  getUserRepliesUrl,
  getUserTopicsUrl,
  getTopicUrl,
  extractTopicIdFromPath,
  extractReplyIdentityFromPath,
} from './urls';
export type { ReplyIdentity } from './urls';

// 解析器导出
export {
  parseUserProfile,
  parseRepliesPage,
  parseTopicsListPage,
  parseTopicDetail,
} from './parsers';

// 服务层导出
export {
  getUserProfile,
  getAllUserReplies,
  getAllUserTopicUrls,
  getAllUserTopicsDetail,
} from './use-cases';
export type {
  ServiceOptions,
  PagedResult,
  UserRepliesResult,
  UserTopicUrlsResult,
  UserTopicsDetailResult,
} from './use-cases';
