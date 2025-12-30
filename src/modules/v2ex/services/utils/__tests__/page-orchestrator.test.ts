import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { FetchResult } from '../../../../fetcher';
import type { PaginatedParseResult } from '../page-orchestrator';

// Mock Fetcher module
const mockFetch = vi.fn();

vi.mock('../../../../fetcher', () => ({
  Fetcher: class {
    fetch = mockFetch;
  },
  SequentialStrategy: class {},
}));

// Import after mocking
import { fetchPagedData } from '../page-orchestrator';

interface TestParseResult extends PaginatedParseResult {
  items: string[];
}

// Helper to create an async generator
async function* mockGenerator(results: FetchResult[]): AsyncGenerator<FetchResult> {
  for (const result of results) {
    yield result;
  }
}

describe('fetchPagedData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('single page scenarios', () => {
    it('should fetch and parse single page data', async () => {
      const page1: FetchResult = {
        url: 'https://example.com?p=1',
        success: true,
        content: '<html>page1</html>',
        statusCode: 200,
      };

      mockFetch.mockReturnValue(mockGenerator([page1]));

      const result = await fetchPagedData(
        (page) => `https://example.com?p=${page}`,
        (): TestParseResult => ({ items: ['a', 'b'], currentPage: 1, totalPages: 1 }),
        (r) => r.items,
      );

      expect(result.data).toEqual(['a', 'b']);
      expect(result.totalPages).toBe(1);
      expect(result.fetchedPages).toBe(1);
      expect(result.failedPages).toBe(0);
    });

    it('should handle empty data on single page', async () => {
      const page1: FetchResult = {
        url: 'https://example.com?p=1',
        success: true,
        content: '<html>empty</html>',
        statusCode: 200,
      };

      mockFetch.mockReturnValue(mockGenerator([page1]));

      const result = await fetchPagedData(
        (page) => `https://example.com?p=${page}`,
        (): TestParseResult => ({ items: [], currentPage: 1, totalPages: 1 }),
        (r) => r.items,
      );

      expect(result.data).toEqual([]);
      expect(result.fetchedPages).toBe(1);
      expect(result.failedPages).toBe(0);
    });
  });

  describe('multi-page scenarios', () => {
    it('should fetch all pages and merge data', async () => {
      const page1: FetchResult = {
        url: 'https://example.com?p=1',
        success: true,
        content: '<html>page1</html>',
        statusCode: 200,
      };
      const page2: FetchResult = {
        url: 'https://example.com?p=2',
        success: true,
        content: '<html>page2</html>',
        statusCode: 200,
      };
      const page3: FetchResult = {
        url: 'https://example.com?p=3',
        success: true,
        content: '<html>page3</html>',
        statusCode: 200,
      };

      // First fetch for page 1
      mockFetch.mockReturnValueOnce(mockGenerator([page1]));
      // Second fetch for pages 2-3
      mockFetch.mockReturnValueOnce(mockGenerator([page2, page3]));

      let callCount = 0;
      const parser = (): TestParseResult => {
        callCount++;
        return {
          items: [`item${callCount}`],
          currentPage: callCount,
          totalPages: 3,
        };
      };

      const result = await fetchPagedData(
        (page) => `https://example.com?p=${page}`,
        parser,
        (r) => r.items,
      );

      expect(result.data).toEqual(['item1', 'item2', 'item3']);
      expect(result.totalPages).toBe(3);
      expect(result.fetchedPages).toBe(3);
      expect(result.failedPages).toBe(0);
    });
  });

  describe('first page error handling', () => {
    it('should return empty result when first page fetch fails', async () => {
      const failed: FetchResult = {
        url: 'https://example.com?p=1',
        success: false,
        content: null,
        error: new Error('Network error'),
        statusCode: 0,
      };

      mockFetch.mockReturnValue(mockGenerator([failed]));

      const result = await fetchPagedData(
        (page) => `https://example.com?p=${page}`,
        (): TestParseResult => ({ items: ['a'], currentPage: 1, totalPages: 1 }),
        (r) => r.items,
      );

      expect(result.data).toEqual([]);
      expect(result.fetchedPages).toBe(0);
      expect(result.failedPages).toBe(1);
    });

    it('should return empty result when first page has no content', async () => {
      const noContent: FetchResult = {
        url: 'https://example.com?p=1',
        success: true,
        content: null,
        statusCode: 200,
      };

      mockFetch.mockReturnValue(mockGenerator([noContent]));

      const result = await fetchPagedData(
        (page) => `https://example.com?p=${page}`,
        (): TestParseResult => ({ items: ['a'], currentPage: 1, totalPages: 1 }),
        (r) => r.items,
      );

      expect(result.data).toEqual([]);
      expect(result.failedPages).toBe(1);
    });

    it('should return empty result when first page parse throws', async () => {
      const page1: FetchResult = {
        url: 'https://example.com?p=1',
        success: true,
        content: '<html>bad</html>',
        statusCode: 200,
      };

      mockFetch.mockReturnValue(mockGenerator([page1]));

      const onError = vi.fn();

      const result = await fetchPagedData(
        (page) => `https://example.com?p=${page}`,
        (): TestParseResult => {
          throw new Error('Parse error');
        },
        (r) => r.items,
        { events: { onError } },
      );

      expect(result.data).toEqual([]);
      expect(result.failedPages).toBe(1);
      // 验证 onError 被调用，total 参数为 -1（未知）
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com?p=1',
          success: false,
          error: expect.any(Error),
        }),
        0,
        -1,
      );
    });
  });

  describe('subsequent page error handling', () => {
    it('should count failures and continue when page fetch fails', async () => {
      const page1: FetchResult = {
        url: 'https://example.com?p=1',
        success: true,
        content: '<html>page1</html>',
        statusCode: 200,
      };
      const page2Failed: FetchResult = {
        url: 'https://example.com?p=2',
        success: false,
        content: null,
        error: new Error('Network error'),
        statusCode: 0,
      };
      const page3: FetchResult = {
        url: 'https://example.com?p=3',
        success: true,
        content: '<html>page3</html>',
        statusCode: 200,
      };

      mockFetch.mockReturnValueOnce(mockGenerator([page1]));
      mockFetch.mockReturnValueOnce(mockGenerator([page2Failed, page3]));

      let callCount = 0;
      const parser = (): TestParseResult => {
        callCount++;
        return {
          items: [`item${callCount}`],
          currentPage: callCount,
          totalPages: 3,
        };
      };

      const result = await fetchPagedData(
        (page) => `https://example.com?p=${page}`,
        parser,
        (r) => r.items,
      );

      expect(result.data).toEqual(['item1', 'item2']);
      expect(result.fetchedPages).toBe(2);
      expect(result.failedPages).toBe(1);
    });

    it('should count failures when parse throws on subsequent page', async () => {
      const page1: FetchResult = {
        url: 'https://example.com?p=1',
        success: true,
        content: '<html>page1</html>',
        statusCode: 200,
      };
      const page2: FetchResult = {
        url: 'https://example.com?p=2',
        success: true,
        content: '<html>page2</html>',
        statusCode: 200,
      };

      mockFetch.mockReturnValueOnce(mockGenerator([page1]));
      mockFetch.mockReturnValueOnce(mockGenerator([page2]));

      let callCount = 0;
      const parser = (): TestParseResult => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Parse error');
        }
        return {
          items: [`item${callCount}`],
          currentPage: callCount,
          totalPages: 2,
        };
      };

      const onError = vi.fn();

      const result = await fetchPagedData(
        (page) => `https://example.com?p=${page}`,
        parser,
        (r) => r.items,
        { events: { onError } },
      );

      expect(result.data).toEqual(['item1']);
      expect(result.fetchedPages).toBe(1);
      expect(result.failedPages).toBe(1);
      // 验证 onError 被调用，total 参数为已知的 totalPages
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com?p=2',
          success: false,
          error: expect.any(Error),
        }),
        1,
        2,
      );
    });
  });

  describe('event callbacks', () => {
    it('should call onStart and onSuccess for first page', async () => {
      const page1: FetchResult = {
        url: 'https://example.com?p=1',
        success: true,
        content: '<html>page1</html>',
        statusCode: 200,
      };

      mockFetch.mockReturnValue(mockGenerator([page1]));

      const onStart = vi.fn();
      const onSuccess = vi.fn();

      await fetchPagedData(
        (page) => `https://example.com?p=${page}`,
        (): TestParseResult => ({ items: ['a'], currentPage: 1, totalPages: 1 }),
        (r) => r.items,
        { events: { onStart, onSuccess } },
      );

      expect(onStart).toHaveBeenCalledWith('https://example.com?p=1', 0, -1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('should call onError when first page fails', async () => {
      const failed: FetchResult = {
        url: 'https://example.com?p=1',
        success: false,
        content: null,
        error: new Error('Network error'),
        statusCode: 0,
      };

      mockFetch.mockReturnValue(mockGenerator([failed]));

      const onError = vi.fn();

      await fetchPagedData(
        (page) => `https://example.com?p=${page}`,
        (): TestParseResult => ({ items: ['a'], currentPage: 1, totalPages: 1 }),
        (r) => r.items,
        { events: { onError } },
      );

      expect(onError).toHaveBeenCalledTimes(1);
    });
  });
});
