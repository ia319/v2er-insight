/**
 * parser/validator.ts 单元测试
 */

import { describe, it, expect } from 'vitest';
import { validateResponse } from '../validator';

describe('validateResponse', () => {
  describe('完整有效数据', () => {
    it('应该正确解析完整的有效响应', () => {
      const validData = {
        summary: '测试摘要',
        professional: {
          tech_stack: ['TypeScript', 'React'],
          career_path: '前端开发',
          level: '中级',
          focus_coherence: '高',
          evolution: {
            summary: '持续成长',
            timeline: [{ period: '2023', focus: 'React' }],
          },
        },
        personal: {
          hobbies: ['编程', '阅读'],
          life_stage: '职场新人',
          values: ['效率', '创新'],
        },
        psychological: {
          scores: {
            openness: 80,
            conscientiousness: 70,
            extraversion: 60,
            agreeableness: 75,
            neuroticism: 30,
          },
          keywords: ['好奇', '理性'],
        },
        behavioral: {
          role: '贡献者',
          interaction_style: '友好',
          active_pattern: '工作日活跃',
          heat_sensitivity: '中等',
        },
        social: {
          content_appeal: '技术分享',
          discussion_depth: '深入',
        },
        risk: {
          level: 'safe',
          reason: '正常用户',
        },
      };

      const result = validateResponse(validData);

      expect(result.warnings).toHaveLength(0);
      expect(result.data.summary).toBe('测试摘要');
      expect(result.data.professional.tech_stack).toEqual(['TypeScript', 'React']);
      expect(result.data.risk.level).toBe('safe');
    });
  });

  describe('缺失字段处理', () => {
    it('空对象应该返回默认值和警告', () => {
      const result = validateResponse({});

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.data.summary).toBe('数据缺失，无法生成摘要');
      expect(result.data.professional.tech_stack).toEqual([]);
      expect(result.data.risk.level).toBe('safe');
    });

    it('非对象输入应该返回默认值', () => {
      const result = validateResponse(null);

      expect(result.warnings).toContain('响应不是有效对象，使用默认值');
      expect(result.data.summary).toBe('数据缺失，无法生成摘要');
    });

    it('字符串输入应该返回默认值', () => {
      const result = validateResponse('invalid');

      expect(result.warnings).toContain('响应不是有效对象，使用默认值');
    });
  });

  describe('嵌套对象深度合并', () => {
    it('缺失 evolution 字段应该使用默认值', () => {
      const data = {
        summary: '测试',
        professional: {
          tech_stack: ['Python'],
          career_path: '后端开发',
          level: '高级',
          focus_coherence: '高',
          // evolution 缺失
        },
        personal: { hobbies: [], life_stage: '资深', values: [] },
        psychological: {
          scores: {
            openness: 70,
            conscientiousness: 70,
            extraversion: 50,
            agreeableness: 60,
            neuroticism: 40,
          },
          keywords: [],
        },
        behavioral: {
          role: '专家',
          interaction_style: '专业',
          active_pattern: '持续',
          heat_sensitivity: '低',
        },
        social: { content_appeal: '技术', discussion_depth: '深' },
        risk: { level: 'safe', reason: '正常' },
      };

      const result = validateResponse(data);

      expect(result.data.professional.evolution).toEqual({
        summary: '未知',
        timeline: [],
      });
    });
  });

  describe('风险等级验证', () => {
    it('有效风险等级应该保留', () => {
      const data = {
        risk: { level: 'suspicious', reason: '可疑行为' },
      };

      const result = validateResponse(data);

      expect(result.data.risk.level).toBe('suspicious');
      expect(result.data.risk.reason).toBe('可疑行为');
    });

    it('无效风险等级应该使用默认值并警告', () => {
      const data = {
        risk: { level: 'invalid_level', reason: '测试' },
      };

      const result = validateResponse(data);

      expect(result.data.risk.level).toBe('safe');
      expect(result.warnings.some((w) => w.includes('无效的 risk.level'))).toBe(true);
    });
  });

  describe('心理评分验证', () => {
    it('部分缺失的评分应该使用默认值 50', () => {
      const data = {
        psychological: {
          scores: {
            openness: 90,
            // 其他缺失
          },
          keywords: [],
        },
      };

      const result = validateResponse(data);

      expect(result.data.psychological.scores.openness).toBe(90);
      expect(result.data.psychological.scores.conscientiousness).toBe(50);
      expect(result.data.psychological.scores.extraversion).toBe(50);
      expect(result.warnings.some((w) => w.includes('conscientiousness'))).toBe(true);
    });
  });
});
