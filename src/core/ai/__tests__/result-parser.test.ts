import { describe, expect, it } from 'vitest';
import { AIResultParseError, parseAIAnalysisResult } from '../result-parser';
import { createAIAnalysisResultFixture as createResult } from './result-fixture';

describe('parseAIAnalysisResult', () => {
  it('should return a complete valid result', () => {
    const result = createResult();
    expect(parseAIAnalysisResult(JSON.stringify(result))).toEqual(result);
  });

  it('should reject invalid JSON without fallback data', () => {
    expect(() => parseAIAnalysisResult('{')).toThrow(
      expect.objectContaining<Partial<AIResultParseError>>({ code: 'invalid_json' }),
    );
  });

  it('should reject an incomplete result without fallback data', () => {
    expect(() => parseAIAnalysisResult(JSON.stringify({ summary: 'Only summary' }))).toThrow(
      expect.objectContaining<Partial<AIResultParseError>>({ code: 'invalid_result' }),
    );
  });

  it('should reject additional fields from structured output', () => {
    expect(() =>
      parseAIAnalysisResult(JSON.stringify({ ...createResult(), unexpected: true })),
    ).toThrow(expect.objectContaining<Partial<AIResultParseError>>({ code: 'invalid_result' }));
  });
});
