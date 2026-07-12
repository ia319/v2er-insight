import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedGetUserProfile = vi.hoisted(() => vi.fn());
const mockedGetAllUserTopicsDetail = vi.hoisted(() => vi.fn());
const mockedGetAllUserReplies = vi.hoisted(() => vi.fn());
const mockedReadDataFile = vi.hoisted(() => vi.fn());
const mockedWriteDataFile = vi.hoisted(() => vi.fn());

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
    mockedReadDataFile.mockReturnValue(null);
    mockedGetUserProfile.mockResolvedValue(profile);
    mockedGetAllUserTopicsDetail.mockResolvedValue({
      topics: [topic],
      totalTopics: 1,
      fetchedTopics: 1,
      failedTopics: 0,
      isHidden: false,
    });
    mockedGetAllUserReplies.mockResolvedValue({
      data: [reply],
      totalPages: 1,
      fetchedPages: 1,
      failedPages: 0,
    });
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

  it('should fetch both collections and persist the current raw shape by default', async () => {
    const result = await runFetch('alice', { pipeline: true });

    expect(mockedGetAllUserTopicsDetail).toHaveBeenCalledOnce();
    expect(mockedGetAllUserReplies).toHaveBeenCalledOnce();
    expect(mockedWriteDataFile).toHaveBeenCalledWith('alice', 'raw', {
      profile,
      topics: [topic],
      replies: [reply],
      isTopicsHidden: false,
    });
    expect(result).toMatchObject({
      status: 'success',
      meta: {
        fetchedTopics: 1,
        fetchedReplies: 1,
      },
    });
  });

  it('should represent an unrequested reply collection as an empty array', async () => {
    await runFetch('alice', { topics: true, pipeline: true });

    expect(mockedGetAllUserReplies).not.toHaveBeenCalled();
    expect(mockedWriteDataFile).toHaveBeenCalledWith(
      'alice',
      'raw',
      expect.objectContaining({ replies: [] }),
    );
  });

  it('should represent an unrequested topic collection as an empty visible list', async () => {
    await runFetch('alice', { replies: true, pipeline: true });

    expect(mockedGetAllUserTopicsDetail).not.toHaveBeenCalled();
    expect(mockedWriteDataFile).toHaveBeenCalledWith(
      'alice',
      'raw',
      expect.objectContaining({ topics: [], isTopicsHidden: false }),
    );
  });

  it('should persist collected data and return partial failure counts', async () => {
    mockedGetAllUserTopicsDetail.mockResolvedValue({
      topics: [topic],
      totalTopics: 2,
      fetchedTopics: 1,
      failedTopics: 1,
      isHidden: false,
    });
    mockedGetAllUserReplies.mockResolvedValue({
      data: [reply],
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
      },
    });
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
});
