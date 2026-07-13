import { describe, expect, it } from 'vitest';

import type { AnalysisStateV1 } from '../state-types';
import { isAnalysisStateV1 } from '../state-validator';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function createState(): AnalysisStateV1 {
  return {
    schemaVersion: 1,
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

describe('isAnalysisStateV1', () => {
  it('accepts empty and fully populated versioned states', () => {
    expect(isAnalysisStateV1({ schemaVersion: 1 })).toBe(true);
    expect(isAnalysisStateV1(createState())).toBe(true);
  });

  it.each([
    { schemaVersion: 2 },
    { schemaVersion: 1, raw: { semanticDataHash: 'invalid', captureStatus: 'complete' } },
    {
      schemaVersion: 1,
      analyzed: {
        sourceSemanticHash: HASH_A,
        analyzerSchemaVersion: 0,
        analysisConfigHash: HASH_B,
        analysisFingerprint: HASH_A,
        payloadHash: HASH_B,
      },
    },
    {
      schemaVersion: 1,
      currentResult: {
        analysisFingerprint: HASH_A,
        stale: 'false',
        basedOnPartial: false,
      },
    },
    {
      schemaVersion: 1,
      currentResult: {
        analysisFingerprint: HASH_A,
        stale: false,
        basedOnPartial: false,
        deliveryMode: 'retry',
      },
    },
    {
      schemaVersion: 1,
      providers: {
        gemini: { lastSentPayloadHash: 'invalid' },
      },
    },
  ])('rejects invalid state %#', (state) => {
    expect(isAnalysisStateV1(state)).toBe(false);
  });
});
