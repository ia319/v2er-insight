import { describe, it, expect } from 'vitest';

import { parseTopicDetail } from '../topic-detail';
import { loadFixture } from '../utils/test-helpers';

const fixturesDir = __dirname;

describe('parseTopicDetail', () => {
  it('should parse topic detail correctly', () => {
    const html = loadFixture(fixturesDir, 'topic-detail.html');
    const result = parseTopicDetail(html);

    expect(result.title).toBe('示例主题标题');
    expect(result.nodeName).toBe('程序员');
    expect(result.createdAt).toBe('2024-01-15 14:30:00 +08:00');
    expect(result.content).toContain('这是主题的正文内容');
    expect(result.replyCount).toBe(25);
    expect(result.lastReplyTime).toBe('2024-01-16 10:00:00 +08:00');
    expect(result.clickCount).toBe(1234);
  });
});
