import { DEFAULT_CONFIG } from './defaults';
import type { AIConfig, ThinkingLevel } from './types/ai';

/** Fully resolved Gemini settings used by the provider runtime. */
export interface ResolvedGeminiConfig {
  apiKey?: string;
  model: string;
  thinkingLevel: ThinkingLevel;
  timeout: number;
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

/**
 * Resolves Gemini settings while preserving the legacy flat configuration format.
 * @param config - AI configuration loaded from defaults and user settings.
 * @returns Gemini settings with provider-specific values taking precedence.
 */
export function resolveGeminiConfig(config?: AIConfig): ResolvedGeminiConfig {
  const defaults = DEFAULT_CONFIG.ai;

  return {
    apiKey: config?.gemini?.apiKey ?? config?.apiKey,
    model: config?.gemini?.model ?? config?.model ?? defaults.model,
    thinkingLevel: config?.gemini?.thinkingLevel ?? config?.thinkingLevel ?? defaults.thinkingLevel,
    timeout: config?.gemini?.timeout ?? config?.timeout ?? defaults.timeout,
    maxRetries: config?.maxRetries ?? defaults.maxRetries,
    baseDelay: config?.baseDelay ?? defaults.baseDelay,
    maxDelay: config?.maxDelay ?? defaults.maxDelay,
  };
}
