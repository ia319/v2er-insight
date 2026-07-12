import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockedReadDataFile = vi.hoisted(() => vi.fn());
const mockedWriteDataFile = vi.hoisted(() => vi.fn());
const mockedBuildAnalyzerOutputFromSnapshot = vi.hoisted(() => vi.fn());
const mockedIsRawSnapshotV2 = vi.hoisted(() => vi.fn());
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
}));

vi.mock('@/core/analyzer', () => ({
  buildAnalyzerOutputFromSnapshot: mockedBuildAnalyzerOutputFromSnapshot,
}));

vi.mock('@/core/snapshot', () => ({
  isRawSnapshotV2: mockedIsRawSnapshotV2,
}));

vi.mock('@/infra/logger', () => ({
  logger: mockLogger,
}));

import { runAnalyze } from '../analyze';

describe('runAnalyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsRawSnapshotV2.mockReturnValue(true);
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
