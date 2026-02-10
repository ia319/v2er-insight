/**
 * AI 响应 Schema 验证器 - 宽松模式
 *
 * 不抛出错误，缺失字段用默认值填充，返回警告列表
 */

import type { AIAnalysisResult } from '../types';

/** 验证结果 */
export interface ValidationResult {
  data: AIAnalysisResult;
  warnings: string[];
}

const DEFAULT_SCORES = {
  openness: 50,
  conscientiousness: 50,
  extraversion: 50,
  agreeableness: 50,
  neuroticism: 50,
};

const DEFAULT_RESULT: AIAnalysisResult = {
  summary: '数据缺失，无法生成摘要',
  professional: {
    tech_stack: [],
    career_path: '未知',
    level: '未知',
    focus_coherence: '未知',
    evolution: {
      summary: '未知',
      timeline: [],
    },
  },
  personal: {
    hobbies: [],
    life_stage: '未知',
    values: [],
  },
  psychological: {
    scores: DEFAULT_SCORES,
    keywords: [],
  },
  behavioral: {
    role: '未知',
    interaction_style: '未知',
    active_pattern: '未知',
    heat_sensitivity: '未知',
  },
  social: {
    content_appeal: '未知',
    discussion_depth: '未知',
  },
  risk: {
    level: 'safe',
    reason: '数据不足，默认安全',
  },
};

const RISK_LEVELS = ['safe', 'suspicious', 'high_risk'] as const;

/**
 * 宽松验证 AI 响应
 *
 * 缺失字段用默认值填充，不抛出错误
 */
export function validateResponse(data: unknown): ValidationResult {
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    warnings.push('响应不是有效对象，使用默认值');
    return { data: structuredClone(DEFAULT_RESULT), warnings };
  }

  const obj = data as Record<string, unknown>;
  const result = structuredClone(DEFAULT_RESULT);

  // summary
  if (typeof obj.summary === 'string') {
    result.summary = obj.summary;
  } else {
    warnings.push('缺少 summary 字段');
  }

  // professional
  if (obj.professional && typeof obj.professional === 'object') {
    result.professional = mergeWithDefault(obj.professional, DEFAULT_RESULT.professional);
  } else {
    warnings.push('缺少 professional 字段');
  }

  // personal
  if (obj.personal && typeof obj.personal === 'object') {
    result.personal = mergeWithDefault(obj.personal, DEFAULT_RESULT.personal);
  } else {
    warnings.push('缺少 personal 字段');
  }

  // psychological
  if (obj.psychological && typeof obj.psychological === 'object') {
    const psych = obj.psychological as Record<string, unknown>;
    result.psychological = {
      scores: validateScores(psych.scores, warnings),
      keywords: Array.isArray(psych.keywords) ? psych.keywords : [],
    };
  } else {
    warnings.push('缺少 psychological 字段');
  }

  // behavioral
  if (obj.behavioral && typeof obj.behavioral === 'object') {
    result.behavioral = mergeWithDefault(obj.behavioral, DEFAULT_RESULT.behavioral);
  } else {
    warnings.push('缺少 behavioral 字段');
  }

  // social
  if (obj.social && typeof obj.social === 'object') {
    result.social = mergeWithDefault(obj.social, DEFAULT_RESULT.social);
  } else {
    warnings.push('缺少 social 字段');
  }

  // risk
  if (obj.risk && typeof obj.risk === 'object') {
    const risk = obj.risk as Record<string, unknown>;
    const isValidLevel = RISK_LEVELS.includes(risk.level as (typeof RISK_LEVELS)[number]);
    result.risk = {
      level: isValidLevel ? (risk.level as (typeof RISK_LEVELS)[number]) : 'safe',
      reason: typeof risk.reason === 'string' ? risk.reason : '未知',
    };
    if (!isValidLevel) {
      warnings.push(`无效的 risk.level: ${risk.level}，使用默认值 safe`);
    }
  } else {
    warnings.push('缺少 risk 字段');
  }

  return { data: result, warnings };
}

/** 验证心理评分，值限制在 0-100 范围 */
function validateScores(scores: unknown, warnings: string[]): typeof DEFAULT_SCORES {
  if (!scores || typeof scores !== 'object') {
    warnings.push('缺少 psychological.scores');
    return { ...DEFAULT_SCORES };
  }

  const s = scores as Record<string, unknown>;
  const result = { ...DEFAULT_SCORES };

  for (const key of Object.keys(DEFAULT_SCORES) as (keyof typeof DEFAULT_SCORES)[]) {
    if (typeof s[key] === 'number') {
      const raw = s[key] as number;
      const clamped = Math.max(0, Math.min(100, raw));
      if (raw !== clamped) {
        warnings.push(`psychological.scores.${key} 值 ${raw} 超出范围，已限制为 ${clamped}`);
      }
      result[key] = clamped;
    } else {
      warnings.push(`缺少 psychological.scores.${key}，使用默认值 50`);
    }
  }

  return result;
}

/** 深度合并对象，缺失字段用默认值 */
function mergeWithDefault<T extends object>(source: unknown, defaults: T): T {
  if (!source || typeof source !== 'object') {
    return defaults;
  }

  const src = source as Record<string, unknown>;
  const result = { ...defaults } as Record<string, unknown>;

  for (const key of Object.keys(defaults)) {
    const defaultValue = (defaults as Record<string, unknown>)[key];
    const sourceValue = src[key];

    if (sourceValue === undefined) {
      continue;
    }

    if (
      defaultValue !== null &&
      typeof defaultValue === 'object' &&
      !Array.isArray(defaultValue) &&
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue)
    ) {
      result[key] = mergeWithDefault(sourceValue, defaultValue as object);
    } else {
      result[key] = sourceValue;
    }
  }

  return result as T;
}
