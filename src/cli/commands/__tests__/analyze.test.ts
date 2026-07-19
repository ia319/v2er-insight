import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockedReadDataFile = vi.hoisted(() => vi.fn());
const mockedWriteDataFile = vi.hoisted(() => vi.fn());
const mockedReadAnalysisState = vi.hoisted(() => vi.fn());
const mockedUpdateAnalysisState = vi.hoisted(() => vi.fn());
const mockedBuildAnalyzerOutputFromSnapshot = vi.hoisted(() => vi.fn());
const mockedIsRawSnapshotV2 = vi.hoisted(() => vi.fn());
const mockedRecordRawProvenance = vi.hoisted(() => vi.fn());
const mockedRecordAnalyzedProvenance = vi.hoisted(() => vi.fn());
const RAW_HASH = 'a'.repeat(64);
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  section: vi.fn(),
  detail: vi.fn(),
}));

vi.mock('@/infra/storage', () => ({
  readDataFile: mockedReadDataFile,
  writeDataFile: mockedWriteDataFile,
  readAnalysisState: mockedReadAnalysisState,
  updateAnalysisState: mockedUpdateAnalysisState,
}));

vi.mock('@/config', () => ({
  getConfig: () => ({ analyzer: {} }),
}));

vi.mock('@/core/analyzer', () => ({
  buildAnalyzerOutputFromSnapshot: mockedBuildAnalyzerOutputFromSnapshot,
}));

vi.mock('@/core/snapshot', () => ({
  isRawSnapshotV2: mockedIsRawSnapshotV2,
}));

vi.mock('@/core/provenance', () => ({
  recordRawProvenance: mockedRecordRawProvenance,
  recordAnalyzedProvenance: mockedRecordAnalyzedProvenance,
}));

vi.mock('@/infra/logger', () => ({
  logger: mockLogger,
}));

import { runAnalyze } from '../analyze';

describe('runAnalyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsRawSnapshotV2.mockReturnValue(true);
    const state = {
      schemaVersion: 1,
      raw: { semanticDataHash: RAW_HASH, captureStatus: 'complete' },
    };
    mockedReadAnalysisState.mockReturnValue({ status: 'valid', state });
    mockedRecordRawProvenance.mockImplementation((current: { schemaVersion: 1 }) => ({
      ...current,
      raw: { semanticDataHash: RAW_HASH, captureStatus: 'complete' },
    }));
    mockedRecordAnalyzedProvenance.mockImplementation((current: { schemaVersion: 1 }) => ({
      ...current,
      analyzed: {
        sourceSemanticHash: RAW_HASH,
        analyzerSchemaVersion: 2,
        analysisConfigHash: RAW_HASH,
        analysisFingerprint: RAW_HASH,
        payloadHash: RAW_HASH,
      },
    }));
    mockedUpdateAnalysisState.mockImplementation(
      (_username: string, update: (current: typeof state) => unknown) => update(state),
    );
  });

  it('should show error when raw data is missing', async () => {
    mockedReadDataFile.mockReturnValue(null);

    const result = await runAnalyze('testuser');

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('testuser'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('v2er fetch'));
    expect(mockedBuildAnalyzerOutputFromSnapshot).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
    expect(result.reasonCode).toBe('ANALYZE_INPUT_MISSING');
    expect(result.recoverable).toBe(true);
  });

  it('should call buildAnalyzerOutputFromSnapshot with validated raw data', async () => {
    const rawData = { capturedAt: '2026-07-12T03:04:05.000Z' };
    const analyzerOutput = {
      userOverview: {
        joinDate: '2020-01-01',
        lastActiveTime: '2024-01-01',
        totalTopics: 10,
        totalReplies: 50,
        topicReplyRatio: 0.2,
      },
      summary: { totalPeriods: 3 },
      contents: ['chunk1'],
    };
    mockedReadDataFile.mockReturnValue(rawData);
    mockedBuildAnalyzerOutputFromSnapshot.mockReturnValue(analyzerOutput);

    const result = await runAnalyze('testuser');

    expect(mockedIsRawSnapshotV2).toHaveBeenCalledWith(rawData);
    expect(mockedBuildAnalyzerOutputFromSnapshot).toHaveBeenCalledWith(rawData);
    expect(result).toMatchObject({
      step: 'analyze',
      status: 'success',
      message: '分析完成',
    });
    expect(mockedUpdateAnalysisState).toHaveBeenCalledOnce();
  });

  it('should reject legacy raw data without provenance', async () => {
    mockedReadDataFile.mockReturnValue({ capturedAt: '2026-07-12T03:04:05.000Z' });
    mockedReadAnalysisState.mockReturnValue({ status: 'missing' });

    const result = await runAnalyze('testuser');

    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'ANALYZE_PROVENANCE_MISSING',
    });
    expect(mockedBuildAnalyzerOutputFromSnapshot).not.toHaveBeenCalled();
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
  });

  it('should reject invalid provenance state before analysis', async () => {
    mockedReadDataFile.mockReturnValue({ capturedAt: '2026-07-12T03:04:05.000Z' });
    mockedReadAnalysisState.mockReturnValue({ status: 'invalid' });

    const result = await runAnalyze('testuser');

    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'PROVENANCE_STATE_INVALID',
    });
    expect(mockedBuildAnalyzerOutputFromSnapshot).not.toHaveBeenCalled();
  });

  it('should reject raw data that does not match its provenance', async () => {
    mockedReadDataFile.mockReturnValue({ capturedAt: '2026-07-12T03:04:05.000Z' });
    mockedRecordRawProvenance.mockReturnValue({
      schemaVersion: 1,
      raw: { semanticDataHash: 'b'.repeat(64), captureStatus: 'complete' },
    });

    const result = await runAnalyze('testuser');

    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'ANALYZE_SOURCE_MISMATCH',
    });
    expect(mockedBuildAnalyzerOutputFromSnapshot).not.toHaveBeenCalled();
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
  });

  it('should reject a capture status that does not match raw data', async () => {
    mockedReadDataFile.mockReturnValue({ capturedAt: '2026-07-12T03:04:05.000Z' });
    mockedRecordRawProvenance.mockReturnValue({
      schemaVersion: 1,
      raw: { semanticDataHash: RAW_HASH, captureStatus: 'partial' },
    });

    const result = await runAnalyze('testuser');

    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'ANALYZE_SOURCE_MISMATCH',
    });
    expect(mockedBuildAnalyzerOutputFromSnapshot).not.toHaveBeenCalled();
  });

  it('should persist analyzed output', async () => {
    const rawData = { capturedAt: '2026-07-12T03:04:05.000Z' };
    const analyzerOutput = {
      userOverview: {
        joinDate: '2020-01-01',
        lastActiveTime: '2024-01-01',
        totalTopics: 10,
        totalReplies: 50,
        topicReplyRatio: 0.2,
      },
      summary: { totalPeriods: 3 },
      contents: ['chunk1'],
    };
    mockedReadDataFile.mockReturnValue(rawData);
    mockedBuildAnalyzerOutputFromSnapshot.mockReturnValue(analyzerOutput);

    const result = await runAnalyze('testuser');

    expect(mockedWriteDataFile).toHaveBeenCalledWith('testuser', 'analyzed', analyzerOutput);
    expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining('已保存'));
    expect(result.status).toBe('success');
  });

  it('should print stats summary after analysis', async () => {
    const analyzerOutput = {
      userOverview: {
        joinDate: '2020-01-01',
        lastActiveTime: '2024-01-01',
        totalTopics: 10,
        totalReplies: 50,
        topicReplyRatio: 0.2,
      },
      summary: { totalPeriods: 3 },
      contents: ['chunk1', 'chunk2'],
    };
    mockedReadDataFile.mockReturnValue({ profile: {} });
    mockedBuildAnalyzerOutputFromSnapshot.mockReturnValue(analyzerOutput);

    const result = await runAnalyze('testuser');

    expect(mockLogger.section).toHaveBeenCalledWith(expect.stringContaining('分析摘要'));
    expect(result.meta).toMatchObject({
      totalPeriods: 3,
      contentChunks: 2,
    });
  });

  it('should suppress summary logs in pipeline mode', async () => {
    const analyzerOutput = {
      userOverview: {
        joinDate: '2020-01-01',
        lastActiveTime: '2024-01-01',
        totalTopics: 10,
        totalReplies: 50,
        topicReplyRatio: 0.2,
      },
      summary: { totalPeriods: 3 },
      contents: ['chunk1'],
    };
    mockedReadDataFile.mockReturnValue({ profile: {} });
    mockedBuildAnalyzerOutputFromSnapshot.mockReturnValue(analyzerOutput);

    const result = await runAnalyze('testuser', { pipeline: true });

    expect(result.status).toBe('success');
    expect(mockLogger.success).not.toHaveBeenCalled();
    expect(mockLogger.section).not.toHaveBeenCalled();
  });

  it('should return ANALYZE_FAILED when analyzer throws', async () => {
    mockedReadDataFile.mockReturnValue({ profile: {}, topics: [], replies: [] });
    mockedBuildAnalyzerOutputFromSnapshot.mockImplementation(() => {
      throw new Error('broken analyzer output');
    });

    const result = await runAnalyze('testuser');

    expect(result.status).toBe('failed');
    expect(result.reasonCode).toBe('ANALYZE_FAILED');
    expect(result.recoverActions?.[0]?.content).toContain('testuser');
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('broken analyzer output'),
    );
  });

  it('should report provenance update failure after preserving analyzed output', async () => {
    const analyzerOutput = {
      schemaVersion: 2,
      userOverview: {
        joinDate: '2020-01-01',
        lastActiveTime: '2024-01-01',
        totalTopics: 10,
        totalReplies: 50,
        topicReplyRatio: 0.2,
      },
      summary: { totalPeriods: 3 },
      contents: ['chunk1'],
    };
    mockedReadDataFile.mockReturnValue({ capturedAt: '2026-07-12T03:04:05.000Z' });
    mockedBuildAnalyzerOutputFromSnapshot.mockReturnValue(analyzerOutput);
    mockedUpdateAnalysisState.mockImplementation(() => {
      throw new Error('state write failed');
    });

    const result = await runAnalyze('testuser', { pipeline: true });

    expect(mockedWriteDataFile).toHaveBeenCalledWith('testuser', 'analyzed', analyzerOutput);
    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'PROVENANCE_UPDATE_FAILED',
      message: expect.stringContaining('analyzed.json 已保存'),
    });
  });

  it('should reject invalid or unsupported raw snapshots', async () => {
    mockedReadDataFile.mockReturnValue({ profile: {}, topics: [], replies: [] });
    mockedIsRawSnapshotV2.mockReturnValue(false);

    const result = await runAnalyze('testuser');

    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'ANALYZE_FAILED',
    });
    expect(mockedBuildAnalyzerOutputFromSnapshot).not.toHaveBeenCalled();
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
  });
});
