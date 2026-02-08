/**
 * Analyzer 输入类型
 */

import type { V2exReply, V2exTopicDetail } from '@/core/v2ex/types/entities';
import type { UserProfileParseResult } from '@/core/v2ex/types/parse-result';

/** V2EX 抓取的原始用户数据 */
export interface RawUserData {
  profile: UserProfileParseResult;
  topics: V2exTopicDetail[];
  replies: V2exReply[];
  isTopicsHidden: boolean;
}
