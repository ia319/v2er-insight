import { describe, expect, it } from 'vitest';
import { isAIAnalysisResult } from '../result-validator';
import { createAIAnalysisResultFixture as createResult } from './result-fixture';

describe('isAIAnalysisResult', () => {
  it('accepts the complete persisted result contract', () => {
    expect(isAIAnalysisResult(createResult())).toBe(true);
  });

  it.each([
    ['missing profile', { ...createResult(), professional: undefined }],
    [
      'invalid string array',
      { ...createResult(), personal: { ...createResult().personal, hobbies: [1] } },
    ],
    [
      'out-of-range score',
      {
        ...createResult(),
        psychological: {
          ...createResult().psychological,
          scores: { ...createResult().psychological.scores, openness: 101 },
        },
      },
    ],
    ['invalid risk level', { ...createResult(), risk: { level: 'unknown', reason: 'Test' } }],
    ['additional root field', { ...createResult(), unexpected: true }],
    [
      'additional nested field',
      { ...createResult(), risk: { ...createResult().risk, unexpected: true } },
    ],
  ])('rejects %s', (_label, value) => {
    expect(isAIAnalysisResult(value)).toBe(false);
  });
});
