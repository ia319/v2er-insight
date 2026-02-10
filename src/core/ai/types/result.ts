/**
 * AI 分析结果类型
 */

/** 职业发展时间线 */
export interface EvolutionTimelineEntry {
  period: string;
  focus: string;
}

/** 职业画像 */
export interface ProfessionalProfile {
  tech_stack: string[];
  career_path: string;
  level: string;
  focus_coherence: string;
  evolution: {
    summary: string;
    timeline: EvolutionTimelineEntry[];
  };
}

/** 个人生活画像 */
export interface PersonalProfile {
  hobbies: string[];
  life_stage: string;
  values: string[];
}

/** 心理画像 (五大性格特质 OCEAN) */
export interface PsychologicalProfile {
  scores: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  keywords: string[];
}

/** 行为画像 */
export interface BehavioralProfile {
  role: string;
  interaction_style: string;
  active_pattern: string;
  heat_sensitivity: string;
}

/** 社交画像 */
export interface SocialProfile {
  content_appeal: string;
  discussion_depth: string;
}

/** 风险评估 */
export interface RiskAssessment {
  level: 'safe' | 'suspicious' | 'high_risk';
  reason: string;
}

/** AI 分析结果总览 */
export interface AIAnalysisResult {
  summary: string;
  professional: ProfessionalProfile;
  personal: PersonalProfile;
  psychological: PsychologicalProfile;
  behavioral: BehavioralProfile;
  social: SocialProfile;
  risk: RiskAssessment;
}
