import { describe, expect, it } from 'vitest';
import { createAIAnalysisResultFixture } from '@/core/ai/__tests__/result-fixture';
import { hashCanonicalJson } from '@/core/provenance/canonical-json';
import { isResultVersionIndex, isResultVersionMetadata, isStoredResultVersion } from '../validator';
import type { ResultInputSummary, ResultVersionMetadata } from '../types';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const DELIVERY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SAVED_AT = '2026-07-26T08:00:00.000Z';

function createMetadata(sequence = 1): ResultVersionMetadata {
  return {
    versionId: `v${String(sequence).padStart(6, '0')}`,
    sequence,
    origin: 'analysis',
    deliveryId: DELIVERY_ID,
    previousLatestVersionId: sequence === 1 ? null : `v${String(sequence - 1).padStart(6, '0')}`,
    previousCurrentHash: sequence === 1 ? null : HASH_B,
    createdAt: SAVED_AT,
    savedAt: SAVED_AT,
    provider: 'gemini',
    model: 'gemini-test',
    reasoningLevel: 'high',
    localSessionId: null,
    externalThreadId: null,
    threadName: null,
    promptHash: HASH_A,
    analysisFingerprint: HASH_A,
    payloadHash: HASH_B,
    resultHash: hashCanonicalJson(createAIAnalysisResultFixture()),
    dataQuality: 'complete',
    warningCount: 0,
    appVersion: '1.2.0',
  };
}

function createInputSummary(): ResultInputSummary {
  return {
    username: 'alice',
    analyzerConfig: { inactivityThresholdDays: 60, nodeDistributionTopN: 3 },
    dataQuality: {
      capturedAt: SAVED_AT,
      topics: { status: 'complete', totalExpected: 1, fetchedCount: 1, failedCount: 0 },
      replies: { status: 'complete', totalExpected: 1, fetchedCount: 1, failedCount: 0 },
    },
    userOverview: {
      joinDate: '2020-01-01',
      lastActiveTime: '2026-07-26',
      topicReplyRatio: 1,
      totalTopics: 1,
      totalReplies: 1,
      isTopicsHidden: false,
      dailyRanking: null,
    },
    activitySummary: { totalPeriods: 0, periods: [] },
  };
}

describe('result version validation', () => {
  it('accepts a generated envelope only when both payload hashes match', () => {
    const result = createAIAnalysisResultFixture();
    const metadata = createMetadata();
    const inputSummary = createInputSummary();
    const envelope = {
      schemaVersion: 1,
      metadata,
      inputSummary,
      inputSummaryHash: hashCanonicalJson(inputSummary),
      result,
    };

    expect(isResultVersionMetadata(metadata)).toBe(true);
    expect(isStoredResultVersion(envelope)).toBe(true);
    expect(
      isStoredResultVersion({
        ...envelope,
        inputSummary: {
          ...inputSummary,
          analyzerConfig: { inactivityThresholdDays: 30, nodeDistributionTopN: 3 },
        },
      }),
    ).toBe(false);
  });

  it('accepts protected current data without invented provenance or input facts', () => {
    const metadata: ResultVersionMetadata = {
      ...createMetadata(),
      origin: 'legacy',
      deliveryId: null,
      provider: 'unknown',
      model: null,
      reasoningLevel: null,
      localSessionId: null,
      externalThreadId: null,
      threadName: null,
      promptHash: null,
      analysisFingerprint: null,
      payloadHash: null,
      dataQuality: 'unknown',
      warningCount: null,
    };

    expect(isResultVersionMetadata(metadata)).toBe(true);
    expect(
      isStoredResultVersion({
        schemaVersion: 1,
        metadata,
        inputSummary: null,
        inputSummaryHash: null,
        result: createAIAnalysisResultFixture(),
      }),
    ).toBe(true);
  });

  it('rejects an envelope whose result differs from its hash', () => {
    const result = createAIAnalysisResultFixture();
    const metadata = createMetadata();
    result.summary = 'Changed';

    expect(
      isStoredResultVersion({
        schemaVersion: 1,
        metadata,
        inputSummary: createInputSummary(),
        inputSummaryHash: hashCanonicalJson(createInputSummary()),
        result,
      }),
    ).toBe(false);
  });

  it('accepts only a contiguous ordered index with unique deliveries', () => {
    const first = createMetadata(1);
    const second = {
      ...createMetadata(2),
      deliveryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    const index = {
      schemaVersion: 1,
      nextSequence: 3,
      latestVersionId: second.versionId,
      versions: [first, second],
      updatedAt: SAVED_AT,
    };

    expect(isResultVersionIndex(index)).toBe(true);
    expect(
      isResultVersionIndex({
        ...index,
        versions: [first, { ...second, deliveryId: DELIVERY_ID }],
      }),
    ).toBe(false);
    expect(isResultVersionIndex({ ...index, nextSequence: 4 })).toBe(false);
  });
});
