import { describe, it, expect } from 'vitest';

import { parseTopicDetail } from '../topic-detail';
import { loadFixture } from '../utils/test-helpers';

const fixturesDir = __dirname;

describe('parseTopicDetail', () => {
  it('parses statistics and the last reply date from the full topic page', () => {
    const html = loadFixture(fixturesDir, 'topic-detail-current.html');

    expect(parseTopicDetail(html)).toMatchObject({
      title: 'Fictional parser topic',
      nodeName: '示例节点',
      createdAt: '2024-04-05 02:03:04 +08:00',
      clickCount: 4567,
      replyCount: 20,
      lastReplyTime: '2024-04-05 11:02:03 +08:00',
    });
  });

  it('reads statistics independently of their translated labels', () => {
    const html = loadFixture(fixturesDir, 'topic-detail-current.html')
      .replace('4567 views', '4567 次点击')
      .replace('20 replies', '20 条回复');

    expect(parseTopicDetail(html)).toMatchObject({
      clickCount: 4567,
      replyCount: 20,
      lastReplyTime: '2024-04-05 11:02:03 +08:00',
    });
  });

  it('ignores statistics-like text outside the topic metadata', () => {
    const html = loadFixture(fixturesDir, 'topic-detail-current.html').replace(
      '<div id="Main">',
      '<div id="Main"><span class="gray">999 条回复 • 1999-01-01 00:00:00 +08:00</span>',
    );

    expect(parseTopicDetail(html)).toMatchObject({
      replyCount: 20,
      lastReplyTime: '2024-04-05 11:02:03 +08:00',
    });
  });

  it('does not use reply dates when the summary separator is missing', () => {
    const html = loadFixture(fixturesDir, 'topic-detail-current.html').replace(
      '<strong class="snow">•</strong>',
      '',
    );

    expect(parseTopicDetail(html)).toMatchObject({ replyCount: 0, lastReplyTime: null });
  });

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
