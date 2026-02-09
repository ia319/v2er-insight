/**
 * AI Analysis Result Types
 */

/** Professional evolution timeline entry */
export interface EvolutionTimelineEntry {
  period: string;
  focus: string;
}

/** Professional profile */
export interface ProfessionalProfile {
  techStack: string[];
  careerPath: string;
  level: string;
  focus_coherence: string;
  evolution: {
    summary: string;
    timeline: EvolutionTimelineEntry[];
  };
}

/** Personal profile */
export interface PersonalProfile {
  hobbies: string[];
  life_stage: string;
  values: string[];
}

/** Psychological profile (OCEAN) */
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

/** Behavioral profile */
export interface BehavioralProfile {
  role: string;
  interactionStyle: string;
  active_pattern: string;
  heat_sensitivity: string;
}

/** Social profile */
export interface SocialProfile {
  content_appeal: string;
  discussion_depth: string;
}

/** Risk assessment */
export interface RiskAssessment {
  level: 'safe' | 'suspicious' | 'high_risk';
  reason: string;
}

/** AI analysis result */
export interface AIAnalysisResult {
  summary: string;
  professional: ProfessionalProfile;
  personal: PersonalProfile;
  psychological: PsychologicalProfile;
  behavioral: BehavioralProfile;
  social: SocialProfile;
  risk: RiskAssessment;
}
