/**
 * Unit tests for parser/index.ts
 */

import { describe, it, expect } from 'vitest';
import { parseResponse } from '../index';

describe('parseResponse', () => {
  describe('JSON extraction', () => {
    it('should parse from plain JSON text', () => {
      const json = JSON.stringify({
        summary: 'Test summary',
        risk: { level: 'safe', reason: 'Normal' },
      });

      const result = parseResponse(json);

      expect(result.data.summary).toBe('Test summary');
    });

    it('should extract JSON from markdown code blocks', () => {
      const text =
        '```json\n{"summary": "Code block test", "risk": {"level": "safe", "reason": "Test"}}\n```';

      const result = parseResponse(text);

      expect(result.data.summary).toBe('Code block test');
    });

    it('should extract JSON from untagged code blocks', () => {
      const text = '```\n{"summary": "Untagged test"}\n```';

      const result = parseResponse(text);

      expect(result.data.summary).toBe('Untagged test');
    });

    it('should handle text before and after code blocks', () => {
      const text =
        'Here is the analysis result:\n```json\n{"summary": "Context text test"}\n```\nAnalysis finished.';

      const result = parseResponse(text);

      expect(result.data.summary).toBe('Context text test');
    });

    it('should prefer json-tagged blocks when multiple blocks exist', () => {
      const text =
        '```text\nThis is not JSON\n```\n```json\n{"summary": "JSON tag preferred"}\n```';

      const result = parseResponse(text);

      expect(result.data.summary).toBe('JSON tag preferred');
    });
  });

  describe('error handling', () => {
    it('should return default values and warnings for invalid JSON', () => {
      const result = parseResponse('not valid JSON');

      expect(result.warnings.some((w) => w.includes('JSON 解析失败'))).toBe(true);
      expect(result.data.summary).toBe('数据缺失，无法生成摘要');
    });

    it('should return default values for empty string', () => {
      const result = parseResponse('');

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should return warnings for corrupted JSON', () => {
      const result = parseResponse('{"summary": "Unclosed');

      expect(result.warnings.some((w) => w.includes('JSON 解析失败'))).toBe(true);
    });
  });
});
