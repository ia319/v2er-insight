import type { AIAnalysisResult } from '../types';

export function createAIAnalysisResultFixture(): AIAnalysisResult {
  return {
    summary: 'Summary',
    professional: {
      tech_stack: ['TypeScript'],
      career_path: 'Backend',
      level: 'Senior',
      focus_coherence: 'High',
      evolution: { summary: 'Stable growth', timeline: [{ period: '2026', focus: 'Node.js' }] },
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
