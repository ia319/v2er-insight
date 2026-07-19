import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedReadDataFileResult = vi.hoisted(() => vi.fn());
const mockedWriteDataFile = vi.hoisted(() => vi.fn());

vi.mock('../reader', () => ({
  readDataFileResult: mockedReadDataFileResult,
}));

vi.mock('../writer', () => ({
  writeDataFile: mockedWriteDataFile,
}));

import type { AnalysisStateV1 } from '@/core/provenance';
import {
  AnalysisStateCorruptError,
  readAnalysisState,
  updateAnalysisState,
} from '../analysis-state';

const HASH = 'a'.repeat(64);

function createState(): AnalysisStateV1 {
  return {
    schemaVersion: 1,
    raw: {
      semanticDataHash: HASH,
      captureStatus: 'complete',
    },
  };
}

describe('analysis state storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('distinguishes missing, invalid, and valid sidecars', () => {
    mockedReadDataFileResult.mockReturnValueOnce({ status: 'missing' });
    expect(readAnalysisState('alice')).toEqual({ status: 'missing' });

    mockedReadDataFileResult.mockReturnValueOnce({ status: 'invalid' });
    expect(readAnalysisState('alice')).toEqual({ status: 'invalid' });

    const state = createState();
    mockedReadDataFileResult.mockReturnValueOnce({ status: 'success', data: state });
    expect(readAnalysisState('alice')).toEqual({ status: 'valid', state });
  });

  it('creates and atomically persists state from a missing sidecar', () => {
    mockedReadDataFileResult.mockReturnValue({ status: 'missing' });

    const next = updateAnalysisState('alice', (state) => ({
      ...state,
      raw: {
        semanticDataHash: HASH,
        captureStatus: 'partial',
      },
    }));

    expect(next.raw?.captureStatus).toBe('partial');
    expect(mockedWriteDataFile).toHaveBeenCalledWith('alice', 'analysisState', next);
  });

  it('updates a valid sidecar without discarding unrelated fields', () => {
    const state: AnalysisStateV1 = {
      ...createState(),
      providers: { gemini: { lastSentAnalysisFingerprint: HASH } },
    };
    mockedReadDataFileResult.mockReturnValue({ status: 'success', data: state });

    const next = updateAnalysisState('alice', (current) => ({
      ...current,
      currentResult: {
        analysisFingerprint: HASH,
        stale: true,
        basedOnPartial: false,
      },
    }));

    expect(next.providers).toEqual(state.providers);
    expect(mockedWriteDataFile).toHaveBeenCalledWith('alice', 'analysisState', next);
  });

  it('does not overwrite an invalid existing sidecar', () => {
    mockedReadDataFileResult.mockReturnValue({ status: 'invalid' });

    expect(() => updateAnalysisState('alice', (state) => state)).toThrow(AnalysisStateCorruptError);
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
  });

  it('does not persist an invalid updater result', () => {
    mockedReadDataFileResult.mockReturnValue({ status: 'missing' });

    expect(() => updateAnalysisState('alice', () => ({ schemaVersion: 2 }))).toThrow(TypeError);
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
  });
});
