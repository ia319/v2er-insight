import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';

import { parsePagination } from '../pagination';

describe('parsePagination', () => {
  it('should return page 1 when no pagination exists', () => {
    const html = '<div></div>';
    const $ = cheerio.load(html);
    const result = parsePagination($);

    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('should parse current page correctly', () => {
    const html = `
      <a class="page_current">3</a>
      <a class="page_normal">1</a>
      <a class="page_normal">2</a>
      <a class="page_normal">4</a>
      <a class="page_normal">10</a>
    `;
    const $ = cheerio.load(html);
    const result = parsePagination($);

    expect(result.currentPage).toBe(3);
    expect(result.totalPages).toBe(10);
  });

  it('should handle single page', () => {
    const html = '<a class="page_current">1</a>';
    const $ = cheerio.load(html);
    const result = parsePagination($);

    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('should fallback to 1 when page text is not a number', () => {
    const html = '<a class="page_current">abc</a>';
    const $ = cheerio.load(html);
    const result = parsePagination($);

    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('should fallback to 1 when page number is negative', () => {
    const html = '<a class="page_current">-5</a>';
    const $ = cheerio.load(html);
    const result = parsePagination($);

    expect(result.currentPage).toBe(1);
    expect(result.totalPages).toBe(1);
  });
});
