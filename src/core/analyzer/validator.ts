import {
  ANALYZER_OUTPUT_SCHEMA_VERSION,
  type AnalyzerOutput,
  type ContentReply,
  type ContentTopic,
  type PeriodContent,
  type PeriodContentChunk,
  type SinglePeriodStats,
  type SnapshotQuality,
  type UserOverview,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isNumberRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isFiniteNumber);
}

function isSnapshotQuality(value: unknown): value is SnapshotQuality {
  return (
    isRecord(value) &&
    (value.status === 'complete' ||
      value.status === 'partial' ||
      value.status === 'not_requested') &&
    (value.totalExpected === null || isNonNegativeInteger(value.totalExpected)) &&
    isNonNegativeInteger(value.fetchedCount) &&
    isNonNegativeInteger(value.failedCount)
  );
}

function isUserOverview(value: unknown): value is UserOverview {
  return (
    isRecord(value) &&
    typeof value.joinDate === 'string' &&
    typeof value.lastActiveTime === 'string' &&
    isNullableNumber(value.topicReplyRatio) &&
    (value.totalTopics === null || isNonNegativeInteger(value.totalTopics)) &&
    (value.totalReplies === null || isNonNegativeInteger(value.totalReplies)) &&
    typeof value.isTopicsHidden === 'boolean' &&
    isNullableNumber(value.dailyRanking)
  );
}

function isPeriodStats(value: unknown): value is SinglePeriodStats {
  return (
    isRecord(value) &&
    typeof value.timeRange === 'string' &&
    isNonNegativeInteger(value.topicCount) &&
    isFiniteNumber(value.avgTopicReplyCount) &&
    isFiniteNumber(value.avgTopicClickCount) &&
    isFiniteNumber(value.avgTopicLifecycleDays) &&
    isFiniteNumber(value.topicInteractionRatio) &&
    isNumberRecord(value.topicHourDistribution) &&
    isNumberRecord(value.topicNodeDistribution) &&
    isNonNegativeInteger(value.replyCount) &&
    isFiniteNumber(value.avgReplyLength) &&
    isFiniteNumber(value.directReplyRatio) &&
    isFiniteNumber(value.avgReplyPosition) &&
    (value.replyWeekdayDistribution === null || isNumberRecord(value.replyWeekdayDistribution)) &&
    isNumberRecord(value.replyNodeDistribution)
  );
}

function isContentTopic(value: unknown): value is ContentTopic {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.nodeName === 'string' &&
    typeof value.content === 'string'
  );
}

function isContentReply(value: unknown): value is ContentReply {
  return (
    isRecord(value) &&
    typeof value.topicTitle === 'string' &&
    typeof value.nodeName === 'string' &&
    typeof value.content === 'string'
  );
}

function isPeriodContent(value: unknown): value is PeriodContent | PeriodContentChunk {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.periodIndex) ||
    !Array.isArray(value.topics) ||
    !value.topics.every(isContentTopic) ||
    !Array.isArray(value.replies) ||
    !value.replies.every(isContentReply)
  ) {
    return false;
  }

  const hasChunkIndex = value.chunkIndex !== undefined;
  const hasChunkTotal = value.totalChunksInPeriod !== undefined;
  return (
    hasChunkIndex === hasChunkTotal &&
    (!hasChunkIndex ||
      (isNonNegativeInteger(value.chunkIndex) &&
        isNonNegativeInteger(value.totalChunksInPeriod) &&
        value.totalChunksInPeriod > 0))
  );
}

/**
 * Validate persisted Analyzer output before it enters an AI provider boundary.
 *
 * @param value - Parsed analyzed.json value.
 * @returns Whether the complete AnalyzerOutput V2 contract is satisfied.
 */
export function isAnalyzerOutput(value: unknown): value is AnalyzerOutput {
  return (
    isRecord(value) &&
    value.schemaVersion === ANALYZER_OUTPUT_SCHEMA_VERSION &&
    isRecord(value.dataQuality) &&
    typeof value.dataQuality.capturedAt === 'string' &&
    isSnapshotQuality(value.dataQuality.topics) &&
    isSnapshotQuality(value.dataQuality.replies) &&
    isUserOverview(value.userOverview) &&
    isRecord(value.summary) &&
    isNonNegativeInteger(value.summary.totalPeriods) &&
    Array.isArray(value.summary.periods) &&
    value.summary.periods.every(isPeriodStats) &&
    Array.isArray(value.contents) &&
    value.contents.every(isPeriodContent)
  );
}
