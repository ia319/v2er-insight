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
}));

// Mock urls - getTopicUrl converts relative path to full URL
vi.mock('../../../urls', () => ({
  getUserTopicsUrl: (username: string, page: number) =>
    `https://www.v2ex.com/member/${username}/topics?p=${page}`,
  getTopicUrl: (path: string) => `https://www.v2ex.com${path}`,
}));

import { getAllUserTopicUrls } from '../topic-urls';
import { parseTopicsListPage } from '../../../parsers';

const mockParseTopicsListPage = vi.mocked(parseTopicsListPage);

// Helper to create an async generator
async function* mockGenerator(results: FetchResult[]): AsyncGenerator<FetchResult> {
  for (const result of results) {
    yield result;
  }
}

describe('getAllUserTopicUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return full URLs (not relative paths)', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=1',
      success: true,
      content: '<html>topics</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));
    mockParseTopicsListPage.mockReturnValue({
      isHidden: false,
      invalidTopicCount: 0,
      topicUrls: ['/t/123456', '/t/789012'],
      currentPage: 1,
      totalPages: 1,
    });

    const result = await getAllUserTopicUrls('testuser');

    // Should return full URLs, not relative paths
    expect(result.data).toEqual(['https://www.v2ex.com/t/123456', 'https://www.v2ex.com/t/789012']);
    expect(result.isHidden).toBe(false);
    expect(result.totalPages).toBe(1);
  });

  it('should detect hidden topics and return empty data', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=1',
      success: true,
      content: '<html>hidden</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));
    mockParseTopicsListPage.mockReturnValue({
      isHidden: true,
      invalidTopicCount: 0,
      topicUrls: [],
      currentPage: 1,
      totalPages: 1,
    });

    const result = await getAllUserTopicUrls('testuser');

    expect(result.data).toEqual([]);
    expect(result.isHidden).toBe(true);
    expect(result.discardedTopicCount).toBe(0);
  });

  it('should preserve an explicitly visible empty topic list', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=1',
      success: true,
      content: '<html>empty</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));
    mockParseTopicsListPage.mockReturnValue({
      isHidden: false,
      invalidTopicCount: 0,
      topicUrls: [],
      currentPage: 1,
      totalPages: 1,
    });

    const result = await getAllUserTopicUrls('testuser');

    expect(result.data).toEqual([]);
    expect(result.isHidden).toBe(false);
  });

  it('should merge URLs from multiple pages', async () => {
    const page1: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=1',
      success: true,
      content: '<html>page1</html>',
      statusCode: 200,
    };
    const page2: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=2',
      success: true,
      content: '<html>page2</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValueOnce(mockGenerator([page1]));
    mockFetch.mockReturnValueOnce(mockGenerator([page2]));

    let callCount = 0;
    mockParseTopicsListPage.mockImplementation(() => {
      callCount++;
      return {
        isHidden: false,
        invalidTopicCount: 0,
        topicUrls: [`/t/page${callCount}`],
        currentPage: callCount,
        totalPages: 2,
      };
    });

    const result = await getAllUserTopicUrls('testuser');

    expect(result.data).toEqual(['https://www.v2ex.com/t/page1', 'https://www.v2ex.com/t/page2']);
    expect(result.totalPages).toBe(2);
    expect(result.fetchedPages).toBe(2);
  });

  it('should discard collected URLs when a later page reports hidden topics', async () => {
    const page1: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=1',
      success: true,
      content: '<html>page1</html>',
      statusCode: 200,
    };
    const page2: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=2',
      success: true,
      content: '<html>hidden</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValueOnce(mockGenerator([page1]));
    mockFetch.mockReturnValueOnce(mockGenerator([page2]));
    mockParseTopicsListPage
      .mockReturnValueOnce({
        isHidden: false,
        invalidTopicCount: 0,
        topicUrls: ['/t/123'],
        currentPage: 1,
        totalPages: 2,
      })
      .mockReturnValueOnce({
        isHidden: true,
        invalidTopicCount: 0,
        topicUrls: [],
        currentPage: 1,
        totalPages: 1,
      });

    const result = await getAllUserTopicUrls('testuser');

    expect(result.data).toEqual([]);
    expect(result.isHidden).toBe(true);
    expect(result.invalidTopicCount).toBe(0);
    expect(result.discardedTopicCount).toBe(1);
  });

  it('should count failures when page fetch fails', async () => {
    const page1: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=1',
      success: true,
      content: '<html>page1</html>',
      statusCode: 200,
    };
    const page2Failed: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=2',
      success: false,
      content: null,
      error: new Error('Network error'),
      statusCode: 0,
    };

    mockFetch.mockReturnValueOnce(mockGenerator([page1]));
    mockFetch.mockReturnValueOnce(mockGenerator([page2Failed]));

    mockParseTopicsListPage.mockReturnValue({
      isHidden: false,
      invalidTopicCount: 0,
      topicUrls: ['/t/123'],
      currentPage: 1,
      totalPages: 2,
    });

    const result = await getAllUserTopicUrls('testuser');

    expect(result.data).toEqual(['https://www.v2ex.com/t/123']);
    expect(result.failedPages).toBe(1);
  });

  it('should expose invalid topic identity counts', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/topics?p=1',
      success: true,
      content: '<html>topics</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));
    mockParseTopicsListPage.mockReturnValue({
      isHidden: false,
      invalidTopicCount: 2,
      topicUrls: ['/t/123'],
      currentPage: 1,
      totalPages: 1,
    });

    const result = await getAllUserTopicUrls('testuser');

    expect(result.invalidTopicCount).toBe(2);
  });
});
