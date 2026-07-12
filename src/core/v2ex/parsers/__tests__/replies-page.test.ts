import { describe, it, expect, beforeAll } from 'vitest';

import { parseRepliesPage } from '../replies-page';
import type { RepliesPageParseResult } from '../../types';
import { loadFixture } from '../utils/test-helpers';

const fixturesDir = __dirname;

describe('parseRepliesPage', () => {
  let result: RepliesPageParseResult;

  beforeAll(() => {
    const html = loadFixture(fixturesDir, 'replies-page.html');
    result = parseRepliesPage(html);
  });

  it('should parse replies list with pagination', () => {
    expect(result.totalReplies).toBe(1234);
    expect(result.invalidReplyCount).toBe(0);
    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(10);
    expect(result.replies).toHaveLength(2);
  });

  it('should parse direct reply correctly', () => {
    const directReply = result.replies[0];
    expect(directReply?.replyId).toBe('100001#reply50');
    expect(directReply?.topicId).toBe('100001');
    expect(directReply?.replyNumber).toBe(50);
    expect(directReply?.topicTitle).toBe('示例主题标题一');
    expect(directReply?.nodeName).toBe('程序员');
    expect(directReply?.replyTime).toBe('2023 年 5 月 12 日');
    expect(directReply?.isDirectReply).toBe(true);
    expect(directReply?.replyTo).toBeNull();
    expect(directReply?.content).toBe('这是一条直接回复主帖的内容。');
  });

  it('should parse reply to another user correctly', () => {
    const mentionReply = result.replies[1];
    expect(mentionReply?.topicTitle).toBe('示例主题标题二');
    expect(mentionReply?.isDirectReply).toBe(false);
    expect(mentionReply?.replyTo).toBe('otheruser');
    expect(mentionReply?.content).toBe('这是一条回复他人的内容。');
  });

  it('should preserve a reply with null identity when its anchor is invalid', () => {
    const html = loadFixture(fixturesDir, 'replies-page.html').replace(
      '/t/100001#reply50',
      '/t/invalid#reply50',
    );

    const invalidResult = parseRepliesPage(html);

    expect(invalidResult.replies[0]).toMatchObject({
      replyId: null,
      topicId: null,
      replyNumber: null,
      topicTitle: '示例主题标题一',
    });
    expect(invalidResult.invalidReplyCount).toBe(1);
  });

  it('should return null when the page omits the declared reply total', () => {
    const resultWithoutTotal = parseRepliesPage('<html><body></body></html>');

    expect(resultWithoutTotal.totalReplies).toBeNull();
  });
});
