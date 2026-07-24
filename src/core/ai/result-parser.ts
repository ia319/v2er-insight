import type { AIAnalysisResult } from './types';
import { isAIAnalysisResult } from './result-validator';

export type AIResultParseErrorCode = 'invalid_json' | 'invalid_result';

/** Reports invalid structured AI result text without producing fallback data. */
export class AIResultParseError extends Error {
  readonly code: AIResultParseErrorCode;

  constructor(code: AIResultParseErrorCode, message: string) {
    super(message);
    this.name = 'AIResultParseError';
    this.code = code;
  }
}

/**
 * Parses one strict structured-output response.
 * @param rawText - Final provider message expected to contain one JSON object.
 * @returns A complete validated AI analysis result.
 * @throws {AIResultParseError} When JSON syntax or the persisted result contract is invalid.
 */
export function parseAIAnalysisResult(rawText: string): AIAnalysisResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new AIResultParseError('invalid_json', 'AI result is not valid JSON');
  }

  if (!isAIAnalysisResult(parsed)) {
    throw new AIResultParseError(
      'invalid_result',
      'AI result does not satisfy the persisted result contract',
    );
  }
  return parsed;
}
