/**
 * parser/index.ts 单元测试
 */

import { describe, it, expect } from 'vitest';
import { parseResponse } from '../index';

describe('parseResponse', () => {
  describe('JSON 提取', () => {
    it('应该从纯 JSON 文本中解析', () => {
      const json = JSON.stringify({ summary: '测试摘要', risk: { level: 'safe', reason: '正常' } });

      const result = parseResponse(json);

      expect(result.data.summary).toBe('测试摘要');
    });

    it('应该从 markdown 代码块中提取 JSON', () => {
      const text =
        '```json\n{"summary": "代码块测试", "risk": {"level": "safe", "reason": "测试"}}\n```';

      const result = parseResponse(text);

      expect(result.data.summary).toBe('代码块测试');
    });

    it('应该从无语言标识的代码块中提取 JSON', () => {
      const text = '```\n{"summary": "无标识测试"}\n```';

      const result = parseResponse(text);

      expect(result.data.summary).toBe('无标识测试');
    });

    it('应该处理代码块前后有文本的情况', () => {
      const text = '以下是分析结果：\n```json\n{"summary": "前后文本测试"}\n```\n分析完成。';

      const result = parseResponse(text);

      expect(result.data.summary).toBe('前后文本测试');
    });
  });

  describe('错误处理', () => {
    it('无效 JSON 应该返回默认值和警告', () => {
      const result = parseResponse('这不是有效的 JSON');

      expect(result.warnings.some((w) => w.includes('JSON 解析失败'))).toBe(true);
      expect(result.data.summary).toBe('数据缺失，无法生成摘要');
    });

    it('空字符串应该返回默认值', () => {
      const result = parseResponse('');

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('损坏的 JSON 应该返回警告', () => {
      const result = parseResponse('{"summary": "未闭合');

      expect(result.warnings.some((w) => w.includes('JSON 解析失败'))).toBe(true);
    });
  });
});
