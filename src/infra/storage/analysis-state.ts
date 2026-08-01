import {
  ANALYSIS_STATE_SCHEMA_VERSION,
  isAnalysisStateV1,
  isAnalysisStateV2,
  migrateAnalysisStateV1,
  type AnalysisState,
} from '@/core/provenance';
import { readDataFileResult } from './reader';
import { writeDataFile } from './writer';

export type AnalysisStateReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; state: AnalysisState };

/** Error for an invalid or unreadable existing sidecar. */
export class AnalysisStateCorruptError extends Error {
  constructor() {
    super('analysis-state.json is invalid or unreadable');
    this.name = 'AnalysisStateCorruptError';
  }
}

/**
 * Reads durable analysis state and migrates valid v1 data in memory.
 *
 * @param username - V2EX username that owns the sidecar.
 * @returns Missing, invalid, or validated current analysis state.
 */
export function readAnalysisState(username: string): AnalysisStateReadResult {
  const result = readDataFileResult(username, 'analysisState');

  if (result.status !== 'success') {
    return result;
  }

  if (isAnalysisStateV2(result.data)) {
    return { status: 'valid', state: result.data };
  }
  if (isAnalysisStateV1(result.data)) {
    return { status: 'valid', state: migrateAnalysisStateV1(result.data) };
  }
  return { status: 'invalid' };
}

/**
 * Validates, updates, and atomically persists one user's analysis state.
 * Existing invalid state remains unchanged.
 *
 * @param username - V2EX username that owns the sidecar.
 * @param update - Pure update applied to validated current state.
 * @returns The validated v2 state written to storage.
 * @throws {AnalysisStateCorruptError} When the existing sidecar is invalid or unreadable.
 * @throws {TypeError} When the updater produces an invalid v2 state.
 */
export function updateAnalysisState(
  username: string,
  update: (state: AnalysisState) => unknown,
): AnalysisState {
  const existing = readAnalysisState(username);
  if (existing.status === 'invalid') {
    throw new AnalysisStateCorruptError();
  }

  const current: AnalysisState =
    existing.status === 'valid' ? existing.state : { schemaVersion: ANALYSIS_STATE_SCHEMA_VERSION };
  const next = update(current);

  if (!isAnalysisStateV2(next)) {
    throw new TypeError('Analysis state update produced an invalid state');
  }

  writeDataFile(username, 'analysisState', next);
  return next;
}
