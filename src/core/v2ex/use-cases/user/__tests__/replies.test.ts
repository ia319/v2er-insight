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
  parseRepliesPage: vi.fn(),
}));

import { getAllUserReplies } from '../replies';
import { parseRepliesPage } from '../../../parsers';

const mockParseRepliesPage = vi.mocked(parseRepliesPage);

// Helper to create an async generator
async function* mockGenerator(results: FetchResult[]): AsyncGenerator<FetchResult> {
  for (const result of results) {
    yield result;
  }
}

describe('getAllUserReplies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all replies from single page', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/replies?p=1',
      success: true,
      content: '<html>replies</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));
    mockParseRepliesPage.mockReturnValue({
      totalReplies: 2,
      invalidReplyCount: 0,
      replies: [
        {
          replyId: '100001#reply10',
          topicId: '100001',
          replyNumber: 10,
          topicTitle: 'Topic 1',
          nodeName: 'node1',
          replyTime: '1 day ago',
          content: 'Reply 1',
          isDirectReply: true,
          replyTo: null,
        },
        {
          replyId: '100002#reply5',
          topicId: '100002',
          replyNumber: 5,
          topicTitle: 'Topic 2',
          nodeName: 'node2',
          replyTime: '2 days ago',
          content: 'Reply 2',
          isDirectReply: false,
          replyTo: 'user2',
        },
      ],
      currentPage: 1,
      totalPages: 1,
    });

    const result = await getAllUserReplies('testuser');

    expect(result.data).toHaveLength(2);
    expect(result.totalPages).toBe(1);
    expect(result.totalReplies).toBe(2);
    expect(result.invalidReplyCount).toBe(0);
    expect(result.fetchedPages).toBe(1);
    expect(result.failedPages).toBe(0);
  });

  it('should merge replies from multiple pages', async () => {
    const page1: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/replies?p=1',
      success: true,
      content: '<html>page1</html>',
      statusCode: 200,
    };
    const page2: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/replies?p=2',
      success: true,
      content: '<html>page2</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValueOnce(mockGenerator([page1]));
    mockFetch.mockReturnValueOnce(mockGenerator([page2]));

    let callCount = 0;
    mockParseRepliesPage.mockImplementation(() => {
      callCount++;
      return {
        totalReplies: 20,
        invalidReplyCount: callCount === 1 ? 1 : 0,
        replies: [
          {
            replyId: callCount === 1 ? null : `10000${callCount}#reply10`,
            topicId: callCount === 1 ? null : `10000${callCount}`,
            replyNumber: callCount === 1 ? null : 10,
            topicTitle: `Topic ${callCount}`,
            nodeName: 'node',
            replyTime: '1 day ago',
            content: `Reply ${callCount}`,
            isDirectReply: true,
            replyTo: null,
          },
        ],
        currentPage: callCount,
        totalPages: 2,
      };
    });

    const result = await getAllUserReplies('testuser');

    expect(result.data).toHaveLength(2);
    expect(result.totalPages).toBe(2);
    expect(result.totalReplies).toBe(20);
    expect(result.invalidReplyCount).toBe(1);
    expect(result.fetchedPages).toBe(2);
  });

  it('should handle empty replies', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/replies?p=1',
      success: true,
      content: '<html>empty</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));
    mockParseRepliesPage.mockReturnValue({
      totalReplies: 0,
      invalidReplyCount: 0,
      replies: [],
      currentPage: 1,
      totalPages: 1,
    });

    const result = await getAllUserReplies('testuser');

    expect(result.data).toEqual([]);
    expect(result.fetchedPages).toBe(1);
  });

  it('should preserve an unknown declared reply total', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/replies?p=1',
      success: true,
      content: '<html>replies without total</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));
    mockParseRepliesPage.mockReturnValue({
      totalReplies: null,
      invalidReplyCount: 0,
      replies: [],
      currentPage: 1,
      totalPages: 1,
    });

    const result = await getAllUserReplies('testuser');

    expect(result.totalReplies).toBeNull();
  });

  it('should count failures when pages fail', async () => {
    const page1: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/replies?p=1',
      success: true,
      content: '<html>page1</html>',
      statusCode: 200,
    };
    const page2Failed: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser/replies?p=2',
      success: false,
      content: null,
      error: new Error('Network error'),
      statusCode: 0,
    };

    mockFetch.mockReturnValueOnce(mockGenerator([page1]));
    mockFetch.mockReturnValueOnce(mockGenerator([page2Failed]));

    mockParseRepliesPage.mockReturnValue({
      totalReplies: 20,
      invalidReplyCount: 0,
      replies: [
        {
          replyId: '100001#reply10',
          topicId: '100001',
          replyNumber: 10,
          topicTitle: 'Topic 1',
          nodeName: 'node',
          replyTime: '1 day ago',
          content: 'Reply 1',
          isDirectReply: true,
          replyTo: null,
        },
      ],
      currentPage: 1,
      totalPages: 2,
    });

    const result = await getAllUserReplies('testuser');

    expect(result.data).toHaveLength(1);
    expect(result.failedPages).toBe(1);
  });
});
