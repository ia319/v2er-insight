import {
  ANALYSIS_STATE_SCHEMA_VERSION,
  isAnalysisStateV1,
  type AnalysisStateV1,
} from '@/core/provenance';
import { readDataFileResult } from './reader';
import { writeDataFile } from './writer';

export type AnalysisStateReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; state: AnalysisStateV1 };

/** Raised when an existing sidecar cannot be validated safely. */
export class AnalysisStateCorruptError extends Error {
  constructor() {
    super('analysis-state.json is invalid or unreadable');
    this.name = 'AnalysisStateCorruptError';
  }
}

/** Read and validate the durable analysis state without hiding corruption. */
export function readAnalysisState(username: string): AnalysisStateReadResult {
  const result = readDataFileResult(username, 'analysisState');

  if (result.status !== 'success') {
    return result;
  }

  return isAnalysisStateV1(result.data)
    ? { status: 'valid', state: result.data }
    : { status: 'invalid' };
}

/**
 * Validate, update, and atomically persist one user's analysis state.
 *
 * Existing invalid state is never replaced automatically.
 */
export function updateAnalysisState(
  username: string,
  update: (state: AnalysisStateV1) => unknown,
): AnalysisStateV1 {
  const existing = readAnalysisState(username);
  if (existing.status === 'invalid') {
    throw new AnalysisStateCorruptError();
  }

  const current: AnalysisStateV1 =
    existing.status === 'valid' ? existing.state : { schemaVersion: ANALYSIS_STATE_SCHEMA_VERSION };
  const next = update(current);

  if (!isAnalysisStateV1(next)) {
    throw new TypeError('Analysis state update produced an invalid state');
  }

  writeDataFile(username, 'analysisState', next);
  return next;
}
