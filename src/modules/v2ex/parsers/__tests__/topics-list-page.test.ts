import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { parseTopicsListPage } from '../topics-list-page';

const loadFixture = (filename: string): string => {
  return readFileSync(join(__dirname, 'fixtures', filename), 'utf-8');
};

describe('parseTopicsListPage', () => {
  it('should parse topics list with pagination', () => {
    const html = loadFixture('topics-list-page.html');
    const result = parseTopicsListPage(html);

    expect(result.isHidden).toBe(false);
    expect(result.topicUrls).toContain('/t/200001');
    expect(result.topicUrls).toContain('/t/200002');
    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(2);
  });

  it('should detect hidden topics list', () => {
    const html = loadFixture('topics-hidden.html');
    const result = parseTopicsListPage(html);

    expect(result.isHidden).toBe(true);
    expect(result.topicUrls).toHaveLength(0);
  });
});
