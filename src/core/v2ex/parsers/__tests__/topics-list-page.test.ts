import { describe, it, expect } from 'vitest';

import { parseTopicsListPage } from '../topics-list-page';
import { loadFixture } from '../utils/test-helpers';

const fixturesDir = __dirname;

describe('parseTopicsListPage', () => {
  it('should parse topics list with pagination', () => {
    const html = loadFixture(fixturesDir, 'topics-list-page.html');
    const result = parseTopicsListPage(html);

    expect(result.isHidden).toBe(false);
    expect(result.topicUrls).toContain('/t/200001');
    expect(result.topicUrls).toContain('/t/200002');
    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(2);
  });

  it('should detect hidden topics list', () => {
    const html = loadFixture(fixturesDir, 'topics-hidden.html');
    const result = parseTopicsListPage(html);

    expect(result.isHidden).toBe(true);
    expect(result.topicUrls).toHaveLength(0);
  });
});
