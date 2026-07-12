/** Raw snapshot schema version persisted in raw.json. */
export const RAW_SNAPSHOT_SCHEMA_VERSION = 2 as const;

/** Collection completeness recorded independently for each requested data scope. */
export type SnapshotCollectionStatus = 'complete' | 'partial' | 'not_requested';

/** Collection data and the diagnostics needed to interpret missing records safely. */
export interface SnapshotCollection<T> {
  status: SnapshotCollectionStatus;
  totalExpected: number | null;
  fetchedCount: number;
  failedCount: number;
  failedPageCount: number;
  identityFailureCount: number;
  items: T[];
}

/** Topic data retained in the versioned raw snapshot. */
export interface TopicSnapshot {
  topicId: string;
  sourceUrl: string;
  title: string;
  nodeName: string;
  createdAt: string;
  content: string;
  replyCount: number;
  lastReplyAt: string | null;
  clickCount: number;
}

/** Precision of a normalized reply occurrence time. */
export type ReplyTimePrecision = 'minute' | 'hour' | 'day' | 'unknown';

/** Reply data retained in the versioned raw snapshot. */
export interface ReplySnapshot {
  replyId: string;
  topicId: string;
  replyNumber: number;
  topicTitle: string;
  nodeName: string;
  displayReplyTime: string;
  occurredAt: string | null;
  timePrecision: ReplyTimePrecision;
  content: string;
  isDirectReply: boolean;
  replyTo: string | null;
}

/** Versioned fetch artifact used as the source of analysis and change detection. */
export interface RawSnapshotV2 {
  schemaVersion: typeof RAW_SNAPSHOT_SCHEMA_VERSION;
  username: string;
  capturedAt: string;
  profile: {
    joinDate: string;
    dailyRanking: number | null;
  };
  topics: SnapshotCollection<TopicSnapshot> & {
    hidden: boolean;
  };
  replies: SnapshotCollection<ReplySnapshot>;
}
