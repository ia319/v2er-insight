import { describe, it, expect } from 'vitest';

import { getTopicUrl, extractTopicIdFromPath, extractReplyIdentityFromPath } from '../topic-urls';

describe('getTopicUrl', () => {
  it('should generate topic URL from string ID', () => {
    expect(getTopicUrl('123456')).toBe('https://www.v2ex.com/t/123456');
  });

  it('should generate topic URL from number ID', () => {
    expect(getTopicUrl(123456)).toBe('https://www.v2ex.com/t/123456');
  });

  it('should generate topic URL from relative path', () => {
    expect(getTopicUrl('/t/123456')).toBe('https://www.v2ex.com/t/123456');
  });

  it('should generate topic URL from path with anchor', () => {
    expect(getTopicUrl('/t/123456#reply50')).toBe('https://www.v2ex.com/t/123456');
  });

  it('should throw error for invalid path containing /t/', () => {
    expect(() => getTopicUrl('/t/abc')).toThrow('Invalid topic path');
    expect(() => getTopicUrl('/t/')).toThrow('Invalid topic path');
  });

  it('should throw error for empty string', () => {
    expect(() => getTopicUrl('')).toThrow('Invalid topic ID: empty string');
    expect(() => getTopicUrl('   ')).toThrow('Invalid topic ID: empty string');
  });

  it('should trim whitespace from ID', () => {
    expect(getTopicUrl('  123456  ')).toBe('https://www.v2ex.com/t/123456');
  });
});

describe('extractTopicIdFromPath', () => {
  it('should extract topic ID from simple path', () => {
    expect(extractTopicIdFromPath('/t/123456')).toBe('123456');
  });

  it('should extract topic ID from path with reply anchor', () => {
    expect(extractTopicIdFromPath('/t/123456#reply50')).toBe('123456');
  });

  it('should return null for invalid path', () => {
    expect(extractTopicIdFromPath('/member/user')).toBeNull();
  });
});

describe('extractReplyIdentityFromPath', () => {
  it('should extract a stable identity from a relative reply URL', () => {
    expect(extractReplyIdentityFromPath('/t/123456#reply50')).toEqual({
      topicId: '123456',
      replyNumber: 50,
      replyId: '123456#reply50',
    });
  });

  it('should extract a stable identity from an absolute reply URL', () => {
    expect(extractReplyIdentityFromPath('https://www.v2ex.com/t/123456?p=2#reply0')).toEqual({
      topicId: '123456',
      replyNumber: 0,
      replyId: '123456#reply0',
    });
  });

  it('should reject paths without a complete numeric reply anchor', () => {
    expect(extractReplyIdentityFromPath('/t/123456')).toBeNull();
    expect(extractReplyIdentityFromPath('/t/123456#reply')).toBeNull();
    expect(extractReplyIdentityFromPath('/t/topic#reply1')).toBeNull();
    expect(extractReplyIdentityFromPath('/t/123456#reply1suffix')).toBeNull();
  });
});
