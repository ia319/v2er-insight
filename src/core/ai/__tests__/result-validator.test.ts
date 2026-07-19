import { describe, expect, it } from 'vitest';
import type { AIAnalysisResult } from '../types';
import { isAIAnalysisResult } from '../result-validator';

function createResult(): AIAnalysisResult {
  return {
    summary: 'Summary',
    professional: {
      tech_stack: ['TypeScript'],
      career_path: 'Backend',
      level: 'Senior',
      focus_coherence: 'High',
      evolution: { summary: 'Stable growth', timeline: [{ period: '2025', focus: 'Node.js' }] },
    },
    personal: { hobbies: ['Reading'], life_stage: 'Career growth', values: ['Quality'] },
    psychological: {
      scores: {
        openness: 80,
        conscientiousness: 70,
        extraversion: 50,
        agreeableness: 60,
        neuroticism: 30,
      },
      keywords: ['Analytical'],
    },
    behavioral: {
      role: 'Contributor',
      interaction_style: 'Constructive',
      active_pattern: 'Weekday',
      heat_sensitivity: 'Low',
    },
    social: { content_appeal: 'Technical depth', discussion_depth: 'Deep' },
    risk: { level: 'safe', reason: 'Normal activity' },
  };
}

describe('isAIAnalysisResult', () => {
  it('accepts the complete persisted result contract', () => {
    expect(isAIAnalysisResult(createResult())).toBe(true);
  });

  it.each([
    ['missing profile', { ...createResult(), professional: undefined }],
    [
      'invalid string array',
      { ...createResult(), personal: { ...createResult().personal, hobbies: [1] } },
    ],
    [
      'out-of-range score',
      {
        ...createResult(),
        psychological: {
          ...createResult().psychological,
          scores: { ...createResult().psychological.scores, openness: 101 },
        },
      },
    ],
    ['invalid risk level', { ...createResult(), risk: { level: 'unknown', reason: 'Test' } }],
  ])('rejects %s', (_label, value) => {
    expect(isAIAnalysisResult(value)).toBe(false);
  });
});
