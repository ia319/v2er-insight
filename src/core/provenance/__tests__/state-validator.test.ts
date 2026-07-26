import { describe, expect, it } from 'vitest';

import type { AnalysisStateV2 } from '../state-types';
import { isAnalysisStateV1, isAnalysisStateV2, migrateAnalysisStateV1 } from '../state-validator';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const DELIVERY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function createState(): AnalysisStateV2 {
  return {
    schemaVersion: 2,
    raw: {
      semanticDataHash: HASH_A,
      captureStatus: 'complete',
    },
    analyzed: {
      sourceSemanticHash: HASH_A,
      analyzerSchemaVersion: 2,
      analysisConfigHash: HASH_B,
      analysisFingerprint: HASH_A,
      payloadHash: HASH_B,
    },
    currentResult: {
      analysisFingerprint: HASH_A,
      stale: false,
      basedOnPartial: false,
      deliveryMode: 'change',
      resultVersionId: 'v000001',
    },
    pendingResultDelivery: {
      deliveryId: DELIVERY_ID,
      providerKey: 'gemini:model',
      analysisFingerprint: HASH_A,
      payloadHash: HASH_B,
      basedOnPartial: false,
      deliveryMode: 'change',
      resultVersionId: null,
    },
    providers: {
      gemini: {
        lastSentAnalysisFingerprint: HASH_A,
        lastSentPayloadHash: HASH_B,
      },
      pending: {},
    },
  };
}

describe('analysis state validation', () => {
  it('accepts empty and fully populated versioned states', () => {
    expect(isAnalysisStateV1({ schemaVersion: 1 })).toBe(true);
    expect(isAnalysisStateV2({ schemaVersion: 2 })).toBe(true);
    expect(isAnalysisStateV2(createState())).toBe(true);
  });

  it('migrates v1 current results without inventing a version ID', () => {
    const migrated = migrateAnalysisStateV1({
      schemaVersion: 1,
      currentResult: {
        analysisFingerprint: HASH_A,
        stale: false,
        basedOnPartial: true,
        deliveryMode: 'resend',
      },
    });

    expect(migrated).toEqual({
      schemaVersion: 2,
      currentResult: {
        analysisFingerprint: HASH_A,
        stale: false,
        basedOnPartial: true,
        deliveryMode: 'resend',
        resultVersionId: null,
      },
    });
    expect(isAnalysisStateV2(migrated)).toBe(true);
  });

  it.each([
    { schemaVersion: 3 },
    { schemaVersion: 2, raw: { semanticDataHash: 'invalid', captureStatus: 'complete' } },
    {
      schemaVersion: 2,
      analyzed: {
        sourceSemanticHash: HASH_A,
        analyzerSchemaVersion: 0,
        analysisConfigHash: HASH_B,
        analysisFingerprint: HASH_A,
        payloadHash: HASH_B,
      },
    },
    {
      schemaVersion: 2,
      currentResult: {
        analysisFingerprint: HASH_A,
        stale: 'false',
        basedOnPartial: false,
        resultVersionId: null,
      },
    },
    {
      schemaVersion: 2,
      currentResult: {
        analysisFingerprint: HASH_A,
        stale: false,
        basedOnPartial: false,
        deliveryMode: 'retry',
        resultVersionId: null,
      },
    },
    {
      schemaVersion: 2,
      currentResult: {
        analysisFingerprint: HASH_A,
        stale: false,
        basedOnPartial: false,
        resultVersionId: 'v1',
      },
    },
    {
      schemaVersion: 2,
      pendingResultDelivery: {
        deliveryId: 'invalid',
        providerKey: 'gemini:model',
        analysisFingerprint: HASH_A,
        payloadHash: HASH_B,
        basedOnPartial: false,
        deliveryMode: 'change',
        resultVersionId: null,
      },
    },
    {
      schemaVersion: 2,
      providers: {
        gemini: { lastSentPayloadHash: 'invalid' },
      },
    },
  ])('rejects invalid state %#', (state) => {
    expect(isAnalysisStateV2(state)).toBe(false);
  });
});
