/**
 * AI 响应 Schema 验证器
 */

import type { AIAnalysisResult } from '../types';

const REQUIRED_FIELDS = [
  'summary',
  'professional',
  'personal',
  'psychological',
  'behavioral',
  'social',
  'risk',
] as const;

const RISK_LEVELS = ['safe', 'suspicious', 'high_risk'] as const;

/**
 * 验证 AI 响应是否符合 Schema
 */
export function validateResponse(data: unknown): AIAnalysisResult {
  if (!data || typeof data !== 'object') {
    throw new Error('无效响应: 期望为对象');
  }

  const obj = data as Record<string, unknown>;

  // 检查必填顶层字段
  for (const field of REQUIRED_FIELDS) {
    if (!(field in obj)) {
      throw new Error(`缺少必填字段: ${field}`);
    }
  }

  // 验证 risk.level 枚举
  const risk = obj.risk as Record<string, unknown>;
  if (!risk || typeof risk !== 'object') {
    throw new Error('无效的 risk 字段: 期望为对象');
  }
  if (!RISK_LEVELS.includes(risk.level as (typeof RISK_LEVELS)[number])) {
    throw new Error(`无效的 risk.level: 期望为其中之一 ${RISK_LEVELS.join(', ')}`);
  }

  // 验证 psychological.scores
  const psych = obj.psychological as Record<string, unknown>;
  if (!psych || typeof psych !== 'object') {
    throw new Error('无效的 psychological 字段: 期望为对象');
  }
  const scores = psych.scores as Record<string, unknown>;
  if (!scores || typeof scores !== 'object') {
    throw new Error('无效的 psychological.scores: 期望为对象');
  }
  const scoreFields = [
    'openness',
    'conscientiousness',
    'extraversion',
    'agreeableness',
    'neuroticism',
  ];
  for (const field of scoreFields) {
    if (typeof scores[field] !== 'number') {
      throw new Error(`无效的 psychological.scores.${field}: 期望为数字`);
    }
  }

  return data as AIAnalysisResult;
}
