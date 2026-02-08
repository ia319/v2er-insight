import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { FetchResult } from '@/infra/fetcher';

// Mock Fetcher module
const mockFetch = vi.fn();

vi.mock('@/infra/fetcher', () => ({
  Fetcher: class {
    fetch = mockFetch;
  },
  SequentialStrategy: class {},
}));

// Mock parsers
vi.mock('../../../parsers', () => ({
  parseTopicsListPage: vi.fn(),
  parseTopicDetail: vi.fn(),
}));

// Mock urls
vi.mock('../../../urls', () => ({
  getUserTopicsUrl: (username: string, page: number) =>
    `https://www.v2ex.com/member/${username}/topics?p=${page}`,
  getTopicUrl: (path: string) => `https://www.v2ex.com${path}`,
}));

import { getAllUserTopicsDetail } from '../topics-detail';
import { parseTopicsListPage, parseTopicDetail } from '../../../parsers';

const mockParseTopicsListPage = vi.mocked(parseTopicsListPage);
const mockParseTopicDetail = vi.mocked(parseTopicDetail);

// Helper to create an async generator
async function* mockGenerator(results: FetchResult[]): AsyncGenerator<FetchResult> {
  for (const result of results) {
    yield result;
  }
}

describe('getAllUserTopicsDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all topic details', async () => {
    // First call: list page
    const listPage: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=1',
      success: true,
      content: '<html>list</html>',
      statusCode: 200,
    };
    // Second call: topic details
    const topic1: FetchResult = {
      url: 'https://www.v2ex.com/t/123',
      success: true,
      content: '<html>topic1</html>',
      statusCode: 200,
    };
    const topic2: FetchResult = {
      url: 'https://www.v2ex.com/t/456',
      success: true,
      content: '<html>topic2</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValueOnce(mockGenerator([listPage]));
    mockFetch.mockReturnValueOnce(mockGenerator([topic1, topic2]));

    mockParseTopicsListPage.mockReturnValue({
      isHidden: false,
      topicUrls: ['/t/123', '/t/456'],
      currentPage: 1,
      totalPages: 1,
    });

    let detailCallCount = 0;
    mockParseTopicDetail.mockImplementation(() => {
      detailCallCount++;
      return {
        title: `Topic ${detailCallCount}`,
        nodeName: 'node',
        createdAt: '2024-01-01',
        content: `Content ${detailCallCount}`,
        replyCount: 10,
        lastReplyTime: '1 hour ago',
        clickCount: 100,
      };
    });

    const result = await getAllUserTopicsDetail('testuser');

    expect(result.topics).toHaveLength(2);
    expect(result.totalTopics).toBe(2);
    expect(result.fetchedTopics).toBe(2);
    expect(result.failedTopics).toBe(0);
    expect(result.isHidden).toBe(false);
  });

  it('should return empty when hidden', async () => {
    const listPage: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=1',
      success: true,
      content: '<html>list</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([listPage]));
    mockParseTopicsListPage.mockReturnValue({
      isHidden: true,
      topicUrls: [],
      currentPage: 1,
      totalPages: 1,
    });

    const result = await getAllUserTopicsDetail('testuser');

    expect(result.topics).toEqual([]);
    expect(result.isHidden).toBe(true);
  });

  it('should return empty when no topics', async () => {
    const listPage: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=1',
      success: true,
      content: '<html>list</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([listPage]));
    mockParseTopicsListPage.mockReturnValue({
      isHidden: false,
      topicUrls: [],
      currentPage: 1,
      totalPages: 1,
    });

    const result = await getAllUserTopicsDetail('testuser');

    expect(result.topics).toEqual([]);
    expect(result.totalTopics).toBe(0);
    // 当主题列表为空且只有单页时，isHidden 为 true（基于 topic-urls.ts 的实现逻辑）
    expect(result.isHidden).toBe(true);
  });

  it('should count failures when topic fetch fails', async () => {
    const listPage: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=1',
      success: true,
      content: '<html>list</html>',
      statusCode: 200,
    };
    const topic1: FetchResult = {
      url: 'https://www.v2ex.com/t/123',
      success: true,
      content: '<html>topic1</html>',
      statusCode: 200,
    };
    const topic2Failed: FetchResult = {
      url: 'https://www.v2ex.com/t/456',
      success: false,
      content: null,
      error: new Error('Network error'),
      statusCode: 0,
    };

    mockFetch.mockReturnValueOnce(mockGenerator([listPage]));
    mockFetch.mockReturnValueOnce(mockGenerator([topic1, topic2Failed]));

    mockParseTopicsListPage.mockReturnValue({
      isHidden: false,
      topicUrls: ['/t/123', '/t/456'],
      currentPage: 1,
      totalPages: 1,
    });

    mockParseTopicDetail.mockReturnValue({
      title: 'Topic 1',
      nodeName: 'node',
      createdAt: '2024-01-01',
      content: 'Content',
      replyCount: 10,
      lastReplyTime: '1 hour ago',
      clickCount: 100,
    });

    const result = await getAllUserTopicsDetail('testuser');

    expect(result.topics).toHaveLength(1);
    expect(result.fetchedTopics).toBe(1);
    expect(result.failedTopics).toBe(1);
  });

  it('should count failures when topic parse throws', async () => {
    const listPage: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=1',
      success: true,
      content: '<html>list</html>',
      statusCode: 200,
    };
    const topic1: FetchResult = {
      url: 'https://www.v2ex.com/t/123',
      success: true,
      content: '<html>topic1</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValueOnce(mockGenerator([listPage]));
    mockFetch.mockReturnValueOnce(mockGenerator([topic1]));

    mockParseTopicsListPage.mockReturnValue({
      isHidden: false,
      topicUrls: ['/t/123'],
      currentPage: 1,
      totalPages: 1,
    });

    mockParseTopicDetail.mockImplementation(() => {
      throw new Error('Parse error');
    });

    const result = await getAllUserTopicsDetail('testuser');

    expect(result.topics).toHaveLength(0);
    expect(result.fetchedTopics).toBe(0);
    expect(result.failedTopics).toBe(1);
  });
});
