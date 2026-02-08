import { describe, it, expect } from 'vitest';

import { getUserProfileUrl, getUserRepliesUrl, getUserTopicsUrl } from '../user-urls';

describe('getUserProfileUrl', () => {
  it('should generate user profile URL', () => {
    expect(getUserProfileUrl('testuser')).toBe('https://www.v2ex.com/member/testuser');
  });
});

describe('getUserRepliesUrl', () => {
  it('should generate user replies URL with default page', () => {
    expect(getUserRepliesUrl('testuser')).toBe('https://www.v2ex.com/member/testuser/replies?p=1');
  });

  it('should generate user replies URL with custom page', () => {
    expect(getUserRepliesUrl('testuser', 5)).toBe(
      'https://www.v2ex.com/member/testuser/replies?p=5',
    );
  });
});

describe('getUserTopicsUrl', () => {
  it('should generate user topics URL with default page', () => {
    expect(getUserTopicsUrl('testuser')).toBe('https://www.v2ex.com/member/testuser/topics?p=1');
  });

  it('should generate user topics URL with custom page', () => {
    expect(getUserTopicsUrl('testuser', 3)).toBe('https://www.v2ex.com/member/testuser/topics?p=3');
  });
});
