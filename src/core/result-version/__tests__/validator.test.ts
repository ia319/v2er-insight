import { describe, expect, it } from 'vitest';
import { createAIAnalysisResultFixture } from '@/core/ai/__tests__/result-fixture';
import { hashCanonicalJson } from '@/core/provenance/canonical-json';
import {
  isResultVersionIndexV1,
  isResultVersionMetadata,
  isStoredResultVersionV1,
} from '../validator';
import type { ResultVersionMetadata } from '../types';

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

describe('result version validation', () => {
  it('accepts generated metadata and a matching result envelope', () => {
    const result = createAIAnalysisResultFixture();
    const metadata = createMetadata();

    expect(isResultVersionMetadata(metadata)).toBe(true);
    expect(
      isStoredResultVersionV1({
        schemaVersion: 1,
        metadata,
        result,
      }),
    ).toBe(true);
  });

  it('accepts protected current metadata without invented provenance', () => {
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
  });

  it('rejects an envelope whose result differs from its hash', () => {
    const result = createAIAnalysisResultFixture();
    const metadata = createMetadata();
    result.summary = 'Changed';

    expect(
      isStoredResultVersionV1({
        schemaVersion: 1,
        metadata,
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

    expect(isResultVersionIndexV1(index)).toBe(true);
    expect(
      isResultVersionIndexV1({
        ...index,
        versions: [first, { ...second, deliveryId: DELIVERY_ID }],
      }),
    ).toBe(false);
    expect(isResultVersionIndexV1({ ...index, nextSequence: 4 })).toBe(false);
  });
});
