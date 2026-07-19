import type {
  AIAnalysisResult,
  BehavioralProfile,
  EvolutionTimelineEntry,
  PersonalProfile,
  ProfessionalProfile,
  PsychologicalProfile,
  RiskAssessment,
  SocialProfile,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isEvolutionTimelineEntry(value: unknown): value is EvolutionTimelineEntry {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['period', 'focus']) &&
    typeof value.period === 'string' &&
    typeof value.focus === 'string'
  );
}

function isProfessionalProfile(value: unknown): value is ProfessionalProfile {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['tech_stack', 'career_path', 'level', 'focus_coherence', 'evolution']) ||
    !isRecord(value.evolution) ||
    !hasExactKeys(value.evolution, ['summary', 'timeline'])
  ) {
    return false;
  }

  return (
    isStringArray(value.tech_stack) &&
    typeof value.career_path === 'string' &&
    typeof value.level === 'string' &&
    typeof value.focus_coherence === 'string' &&
    typeof value.evolution.summary === 'string' &&
    Array.isArray(value.evolution.timeline) &&
    value.evolution.timeline.every(isEvolutionTimelineEntry)
  );
}

function isPersonalProfile(value: unknown): value is PersonalProfile {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['hobbies', 'life_stage', 'values']) &&
    isStringArray(value.hobbies) &&
    typeof value.life_stage === 'string' &&
    isStringArray(value.values)
  );
}

function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isPsychologicalProfile(value: unknown): value is PsychologicalProfile {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['scores', 'keywords']) ||
    !isRecord(value.scores) ||
    !hasExactKeys(value.scores, [
      'openness',
      'conscientiousness',
      'extraversion',
      'agreeableness',
      'neuroticism',
    ])
  ) {
    return false;
  }

  return (
    isScore(value.scores.openness) &&
    isScore(value.scores.conscientiousness) &&
    isScore(value.scores.extraversion) &&
    isScore(value.scores.agreeableness) &&
    isScore(value.scores.neuroticism) &&
    isStringArray(value.keywords)
  );
}

function isBehavioralProfile(value: unknown): value is BehavioralProfile {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['role', 'interaction_style', 'active_pattern', 'heat_sensitivity']) &&
    typeof value.role === 'string' &&
    typeof value.interaction_style === 'string' &&
    typeof value.active_pattern === 'string' &&
    typeof value.heat_sensitivity === 'string'
  );
}

function isSocialProfile(value: unknown): value is SocialProfile {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['content_appeal', 'discussion_depth']) &&
    typeof value.content_appeal === 'string' &&
    typeof value.discussion_depth === 'string'
  );
}

function isRiskAssessment(value: unknown): value is RiskAssessment {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['level', 'reason']) &&
    (value.level === 'safe' || value.level === 'suspicious' || value.level === 'high_risk') &&
    typeof value.reason === 'string'
  );
}

/**
 * Validates the complete persisted AI result contract.
 *
 * @param value - Parsed result.json value.
 * @returns Whether every required AIAnalysisResult field is valid.
 */
export function isAIAnalysisResult(value: unknown): value is AIAnalysisResult {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'summary',
      'professional',
      'personal',
      'psychological',
      'behavioral',
      'social',
      'risk',
    ]) &&
    typeof value.summary === 'string' &&
    isProfessionalProfile(value.professional) &&
    isPersonalProfile(value.personal) &&
    isPsychologicalProfile(value.psychological) &&
    isBehavioralProfile(value.behavioral) &&
    isSocialProfile(value.social) &&
    isRiskAssessment(value.risk)
  );
}
