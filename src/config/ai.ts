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

/** Fully resolved Codex settings used by runtime selection and turns. */
export interface ResolvedCodexConfig {
  executable?: string;
  projectPath?: string;
  model: string;
  reasoningEffort: string;
  startupTimeout: number;
  turnTimeout: number;
  shutdownGrace: number;
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

/**
 * Resolves Codex settings exclusively from the Codex provider namespace and defaults.
 * @param config - AI configuration loaded from defaults and user settings.
 * @returns Codex process, project, model, effort, and timeout settings.
 */
export function resolveCodexConfig(config?: AIConfig): ResolvedCodexConfig {
  const defaults = DEFAULT_CONFIG.ai.codex;
  const codex = config?.codex;

  return {
    ...(codex?.executable ? { executable: codex.executable } : {}),
    ...(codex?.projectPath ? { projectPath: codex.projectPath } : {}),
    model: codex?.model ?? defaults.model,
    reasoningEffort: codex?.reasoningEffort ?? defaults.reasoningEffort,
    startupTimeout: codex?.startupTimeout ?? defaults.startupTimeout,
    turnTimeout: codex?.turnTimeout ?? defaults.turnTimeout,
    shutdownGrace: codex?.shutdownGrace ?? defaults.shutdownGrace,
  };
}
