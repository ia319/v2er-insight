import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { parseRepliesPage } from '../replies-page';

const loadFixture = (filename: string): string => {
  return readFileSync(join(__dirname, 'fixtures', filename), 'utf-8');
};

describe('parseRepliesPage', () => {
  it('should parse replies list with pagination', () => {
    const html = loadFixture('replies-page.html');
    const result = parseRepliesPage(html);

    expect(result.totalReplies).toBe(1234);
    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(10);
    expect(result.replies).toHaveLength(2);
  });

  it('should parse direct reply correctly', () => {
    const html = loadFixture('replies-page.html');
    const result = parseRepliesPage(html);

    const directReply = result.replies[0];
    expect(directReply?.topicTitle).toBe('示例主题标题一');
    expect(directReply?.nodeName).toBe('程序员');
    expect(directReply?.replyTime).toBe('2 小时前');
    expect(directReply?.isDirectReply).toBe(true);
    expect(directReply?.replyTo).toBeNull();
    expect(directReply?.content).toBe('这是一条直接回复主帖的内容。');
  });

  it('should parse reply to another user correctly', () => {
    const html = loadFixture('replies-page.html');
    const result = parseRepliesPage(html);

    const mentionReply = result.replies[1];
    expect(mentionReply?.topicTitle).toBe('示例主题标题二');
    expect(mentionReply?.isDirectReply).toBe(false);
    expect(mentionReply?.replyTo).toBe('otheruser');
    expect(mentionReply?.content).toBe('这是一条回复他人的内容。');
  });
});
