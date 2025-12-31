import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { FetchResult } from '@/modules/fetcher';

// Mock Fetcher module
const mockFetch = vi.fn();

vi.mock('../../../../fetcher', () => ({
  Fetcher: class {
    fetch = mockFetch;
  },
  SequentialStrategy: class {},
}));

// Mock parsers
vi.mock('../../../parsers', () => ({
  parseUserProfile: vi.fn(),
}));

import { getUserProfile } from '../profile';
import { parseUserProfile } from '../../../parsers';

const mockParseUserProfile = vi.mocked(parseUserProfile);

// Helper to create an async generator
async function* mockGenerator(results: FetchResult[]): AsyncGenerator<FetchResult> {
  for (const result of results) {
    yield result;
  }
}

describe('getUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw error for empty username', async () => {
    await expect(getUserProfile('')).rejects.toThrow('Invalid username: empty string');
    await expect(getUserProfile('   ')).rejects.toThrow('Invalid username: empty string');
  });

  it('should return parsed profile on successful fetch', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser',
      success: true,
      content: '<html>profile</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));
    mockParseUserProfile.mockReturnValue({
      dailyRanking: 42,
      joinDate: '2020-01-01 12:00:00 +08:00',
    });

    const result = await getUserProfile('testuser');

    expect(result).toEqual({
      dailyRanking: 42,
      joinDate: '2020-01-01 12:00:00 +08:00',
    });
    expect(mockParseUserProfile).toHaveBeenCalledWith('<html>profile</html>');
  });

  it('should return null on fetch failure', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser',
      success: false,
      content: null,
      error: new Error('Network error'),
      statusCode: 0,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));

    const result = await getUserProfile('testuser');

    expect(result).toBeNull();
    expect(mockParseUserProfile).not.toHaveBeenCalled();
  });

  it('should return null when content is empty', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser',
      success: true,
      content: null,
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));

    const result = await getUserProfile('testuser');

    expect(result).toBeNull();
  });

  it('should return null on parse error', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser',
      success: true,
      content: '<html>bad</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));
    mockParseUserProfile.mockImplementation(() => {
      throw new Error('Parse error');
    });

    const result = await getUserProfile('testuser');

    expect(result).toBeNull();
  });

  it('should call event callbacks', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser',
      success: true,
      content: '<html>profile</html>',
      statusCode: 200,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));
    mockParseUserProfile.mockReturnValue({
      dailyRanking: 1,
      joinDate: '2020-01-01',
    });

    const onStart = vi.fn();
    const onSuccess = vi.fn();

    await getUserProfile('testuser', { events: { onStart, onSuccess } });

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('should call onError callback on failure', async () => {
    const fetchResult: FetchResult = {
      url: 'https://www.v2ex.com/member/testuser',
      success: false,
      content: null,
      error: new Error('Failed'),
      statusCode: 0,
    };

    mockFetch.mockReturnValue(mockGenerator([fetchResult]));

    const onError = vi.fn();

    await getUserProfile('testuser', { events: { onError } });

    expect(onError).toHaveBeenCalledTimes(1);
  });
});
