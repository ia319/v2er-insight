import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedGetUserProfile = vi.hoisted(() => vi.fn());
const mockedGetAllUserTopicsDetail = vi.hoisted(() => vi.fn());
const mockedGetAllUserReplies = vi.hoisted(() => vi.fn());
const mockedReadDataFile = vi.hoisted(() => vi.fn());
const mockedWriteDataFile = vi.hoisted(() => vi.fn());
const mockedReadAnalysisState = vi.hoisted(() => vi.fn());
const mockedUpdateAnalysisState = vi.hoisted(() => vi.fn());

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  section: vi.fn(),
  detail: vi.fn(),
  progress: vi.fn(),
}));

vi.mock('@/core/v2ex', () => ({
  getUserProfile: mockedGetUserProfile,
  getAllUserTopicsDetail: mockedGetAllUserTopicsDetail,
  getAllUserReplies: mockedGetAllUserReplies,
}));

vi.mock('@/infra/storage', () => ({
  readDataFile: mockedReadDataFile,
  writeDataFile: mockedWriteDataFile,
  readAnalysisState: mockedReadAnalysisState,
  updateAnalysisState: mockedUpdateAnalysisState,
}));

vi.mock('@/infra/logger', () => ({
  logger: mockLogger,
}));

import { runFetch } from '../fetch';

const profile = {
  joinDate: '2020-01-01 00:00:00 +08:00',
  dailyRanking: null,
};

const topic = {
  topicId: '200001',
  sourceUrl: 'https://www.v2ex.com/t/200001',
  title: 'Snapshot design',
  nodeName: 'programmer',
  createdAt: '2026-07-01 10:00:00 +08:00',
  content: 'Topic content',
  replyCount: 1,
  lastReplyTime: '2026-07-01 11:00:00 +08:00',
  clickCount: 20,
};

const reply = {
  replyId: '100001#reply1',
  topicId: '100001',
  replyNumber: 1,
  topicTitle: 'Snapshot design',
  nodeName: 'programmer',
  replyTime: '1 天前',
  content: 'Reply content',
  isDirectReply: true,
  replyTo: null,
};

describe('runFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T03:04:05.000Z'));
    mockedReadDataFile.mockReturnValue(null);
    mockedReadAnalysisState.mockReturnValue({ status: 'missing' });
    mockedUpdateAnalysisState.mockImplementation(
      (_username: string, update: (state: { schemaVersion: 1 }) => unknown) =>
        update({ schemaVersion: 1 }),
    );
    mockedGetUserProfile.mockResolvedValue(profile);
    mockedGetAllUserTopicsDetail.mockResolvedValue({
      topics: [topic],
      totalTopics: 1,
      fetchedTopics: 1,
      failedTopics: 0,
      failedPages: 0,
      invalidTopicCount: 0,
      isHidden: false,
    });
    mockedGetAllUserReplies.mockResolvedValue({
      data: [reply],
      totalReplies: 1,
      invalidReplyCount: 0,
      totalPages: 1,
      fetchedPages: 1,
      failedPages: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should skip fetching when cached raw data exists', async () => {
    mockedReadDataFile.mockReturnValue({ profile });

    const result = await runFetch('alice', {});

    expect(result.status).toBe('skipped');
    expect(mockedGetUserProfile).not.toHaveBeenCalled();
    expect(mockedGetAllUserTopicsDetail).not.toHaveBeenCalled();
    expect(mockedGetAllUserReplies).not.toHaveBeenCalled();
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
  });

  it('should fetch both collections and persist Raw Snapshot V2 by default', async () => {
    const result = await runFetch('alice', { pipeline: true });

    expect(mockedGetAllUserTopicsDetail).toHaveBeenCalledOnce();
    expect(mockedGetAllUserReplies).toHaveBeenCalledOnce();
    expect(mockedWriteDataFile).toHaveBeenCalledWith(
      'alice',
      'raw',
      expect.objectContaining({
        schemaVersion: 2,
        username: 'alice',
        capturedAt: '2026-07-12T03:04:05.000Z',
        profile,
        topics: expect.objectContaining({
          status: 'complete',
          totalExpected: 1,
          fetchedCount: 1,
          items: [expect.objectContaining({ topicId: '200001' })],
        }),
        replies: expect.objectContaining({
          status: 'complete',
          totalExpected: 1,
          fetchedCount: 1,
          items: [expect.objectContaining({ replyId: '100001#reply1' })],
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'success',
      meta: {
        fetchedTopics: 1,
        fetchedReplies: 1,
      },
    });
    expect(mockedUpdateAnalysisState).toHaveBeenCalledOnce();
    expect(mockedUpdateAnalysisState.mock.results[0]?.value).toMatchObject({
      raw: {
        semanticDataHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        captureStatus: 'complete',
      },
    });
  });

  it('should stop before network access when analysis state is invalid', async () => {
    mockedReadAnalysisState.mockReturnValue({ status: 'invalid' });

    const result = await runFetch('alice', { force: true, pipeline: true });

    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'PROVENANCE_STATE_INVALID',
    });
    expect(mockedGetUserProfile).not.toHaveBeenCalled();
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
    expect(mockedUpdateAnalysisState).not.toHaveBeenCalled();
  });

  it('should mark an unrequested reply collection explicitly', async () => {
    await runFetch('alice', { topics: true, pipeline: true });

    expect(mockedGetAllUserReplies).not.toHaveBeenCalled();
    expect(mockedWriteDataFile).toHaveBeenCalledWith(
      'alice',
      'raw',
      expect.objectContaining({
        replies: expect.objectContaining({
          status: 'not_requested',
          totalExpected: null,
          items: [],
        }),
      }),
    );
  });

  it('should mark an unrequested topic collection explicitly', async () => {
    await runFetch('alice', { replies: true, pipeline: true });

    expect(mockedGetAllUserTopicsDetail).not.toHaveBeenCalled();
    expect(mockedWriteDataFile).toHaveBeenCalledWith(
      'alice',
      'raw',
      expect.objectContaining({
        topics: expect.objectContaining({
          status: 'not_requested',
          totalExpected: null,
          hidden: false,
          items: [],
        }),
      }),
    );
  });

  it('should persist collected data and return partial failure counts', async () => {
    mockedGetAllUserTopicsDetail.mockResolvedValue({
      topics: [topic],
      totalTopics: 2,
      fetchedTopics: 1,
      failedTopics: 1,
      failedPages: 0,
      invalidTopicCount: 0,
      isHidden: false,
    });
    mockedGetAllUserReplies.mockResolvedValue({
      data: [reply],
      totalReplies: 3,
      invalidReplyCount: 0,
      totalPages: 3,
      fetchedPages: 1,
      failedPages: 2,
    });

    const result = await runFetch('alice', { pipeline: true });

    expect(mockedWriteDataFile).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: 'partial',
      reasonCode: 'FETCH_PARTIAL_FAILED',
      meta: {
        failedTopics: 1,
        failedPages: 2,
        identityFailures: 0,
      },
    });
  });

  it('should return partial when a requested reply total is unknown', async () => {
    mockedGetAllUserReplies.mockResolvedValue({
      data: [reply],
      totalReplies: null,
      invalidReplyCount: 0,
      totalPages: 1,
      fetchedPages: 1,
      failedPages: 0,
    });

    const result = await runFetch('alice', {});

    expect(result).toMatchObject({
      status: 'partial',
      reasonCode: 'FETCH_PARTIAL_FAILED',
    });
    expect(mockLogger.detail).toHaveBeenCalledWith('Replies: 1/?');
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('缺失记录不能解释为删除'));
  });

  it('should report conflicting duplicate identities as partial', async () => {
    mockedGetAllUserTopicsDetail.mockResolvedValue({
      topics: [topic, { ...topic, title: 'Conflicting snapshot design' }],
      totalTopics: 1,
      fetchedTopics: 2,
      failedTopics: 0,
      failedPages: 0,
      invalidTopicCount: 0,
      isHidden: false,
    });

    const result = await runFetch('alice', {});

    expect(result).toMatchObject({
      status: 'partial',
      reasonCode: 'FETCH_PARTIAL_FAILED',
      meta: {
        duplicateConflicts: 1,
      },
    });
    expect(mockLogger.detail).toHaveBeenCalledWith(expect.stringContaining('duplicateConflicts=1'));
  });

  it('should stop without writing data when the profile request fails', async () => {
    mockedGetUserProfile.mockResolvedValue(null);

    const result = await runFetch('alice', { pipeline: true });

    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'FETCH_PROFILE_FAILED',
    });
    expect(mockedGetAllUserTopicsDetail).not.toHaveBeenCalled();
    expect(mockedGetAllUserReplies).not.toHaveBeenCalled();
    expect(mockedWriteDataFile).not.toHaveBeenCalled();
  });

  it('should report provenance update failure after preserving raw data', async () => {
    mockedUpdateAnalysisState.mockImplementation(() => {
      throw new Error('state write failed');
    });

    const result = await runFetch('alice', { pipeline: true });

    expect(mockedWriteDataFile).toHaveBeenCalledWith('alice', 'raw', expect.any(Object));
    expect(result).toMatchObject({
      status: 'failed',
      reasonCode: 'PROVENANCE_UPDATE_FAILED',
      message: expect.stringContaining('raw.json 已保存'),
    });
  });
});
