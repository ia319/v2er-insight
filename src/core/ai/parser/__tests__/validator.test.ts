/**
 * Unit tests for parser/validator.ts
 */

import { describe, it, expect } from 'vitest';
import { validateResponse } from '../validator';

describe('validateResponse', () => {
  describe('complete valid data', () => {
    it('should correctly parse complete valid response', () => {
      const validData = {
        summary: 'Test summary',
        professional: {
          tech_stack: ['TypeScript', 'React'],
          career_path: 'Frontend Developer',
          level: 'Intermediate',
          focus_coherence: 'High',
          evolution: {
            summary: 'Continuous growth',
            timeline: [{ period: '2023', focus: 'React' }],
          },
        },
        personal: {
          hobbies: ['Programming', 'Reading'],
          life_stage: 'Career Starter',
          values: ['Efficiency', 'Innovation'],
        },
        psychological: {
          scores: {
            openness: 80,
            conscientiousness: 70,
            extraversion: 60,
            agreeableness: 75,
            neuroticism: 30,
          },
          keywords: ['Curious', 'Rational'],
        },
        behavioral: {
          role: 'Contributor',
          interaction_style: 'Friendly',
          active_pattern: 'Weekday active',
          heat_sensitivity: 'Medium',
        },
        social: {
          content_appeal: 'Tech sharing',
          discussion_depth: 'Deep',
        },
        risk: {
          level: 'safe',
          reason: 'Normal user',
        },
      };

      const result = validateResponse(validData);

      expect(result.warnings).toHaveLength(0);
      expect(result.data.summary).toBe('Test summary');
      expect(result.data.professional.tech_stack).toEqual(['TypeScript', 'React']);
      expect(result.data.risk.level).toBe('safe');
    });
  });

  describe('missing field handling', () => {
    it('should return default values and warnings for empty object', () => {
      const result = validateResponse({});

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.data.summary).toBe('数据缺失，无法生成摘要');
      expect(result.data.professional.tech_stack).toEqual([]);
      expect(result.data.risk.level).toBe('safe');
    });

    it('should return default values for non-object input', () => {
      const result = validateResponse(null);

      expect(result.warnings).toContain('响应不是有效对象，使用默认值');
      expect(result.data.summary).toBe('数据缺失，无法生成摘要');
    });

    it('should return default values for string input', () => {
      const result = validateResponse('invalid');

      expect(result.warnings).toContain('响应不是有效对象，使用默认值');
    });
  });

  describe('deep merge of nested objects', () => {
    it('should use default values for missing evolution field', () => {
      const data = {
        summary: 'Test',
        professional: {
          tech_stack: ['Python'],
          career_path: 'Backend Developer',
          level: 'Senior',
          focus_coherence: 'High',
          // evolution 缺失
        },
        personal: { hobbies: [], life_stage: 'Senior', values: [] },
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
          role: 'Expert',
          interaction_style: 'Professional',
          active_pattern: 'Continuous',
          heat_sensitivity: 'Low',
        },
        social: { content_appeal: 'Tech', discussion_depth: 'Deep' },
        risk: { level: 'safe', reason: 'Normal' },
      };

      const result = validateResponse(data);

      expect(result.data.professional.evolution).toEqual({
        summary: '未知',
        timeline: [],
      });
    });
  });

  describe('risk level validation', () => {
    it('should retain valid risk levels', () => {
      const data = {
        risk: { level: 'suspicious', reason: 'Suspicious behavior' },
      };

      const result = validateResponse(data);

      expect(result.data.risk.level).toBe('suspicious');
      expect(result.data.risk.reason).toBe('Suspicious behavior');
    });

    it('should use default value and warn for invalid risk levels', () => {
      const data = {
        risk: { level: 'invalid_level', reason: 'Test' },
      };

      const result = validateResponse(data);

      expect(result.data.risk.level).toBe('safe');
      expect(result.warnings.some((w) => w.includes('无效的 risk.level'))).toBe(true);
    });
  });

  describe('psychological score validation', () => {
    it('should use default value 50 for partially missing scores', () => {
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

    it('should clamp out-of-range scores to 0-100 and add warnings', () => {
      const data = {
        psychological: {
          scores: {
            openness: 150,
            conscientiousness: -10,
            extraversion: 50,
            agreeableness: 75,
            neuroticism: 200,
          },
          keywords: [],
        },
      };

      const result = validateResponse(data);

      expect(result.data.psychological.scores.openness).toBe(100);
      expect(result.data.psychological.scores.conscientiousness).toBe(0);
      expect(result.data.psychological.scores.neuroticism).toBe(100);
      expect(result.data.psychological.scores.extraversion).toBe(50);
      expect(result.warnings.some((w) => w.includes('openness') && w.includes('150'))).toBe(true);
      expect(
        result.warnings.some((w) => w.includes('conscientiousness') && w.includes('-10')),
      ).toBe(true);
    });
  });
});
