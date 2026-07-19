/**
 * AI 模块配置类型
 *
 * ThinkingLevel 使用小写值，与 @google/genai SDK 内部类型一致。
 * SDK 导出的枚举值（如 ThinkingLevel.HIGH = "HIGH"）用于 API 调用，
 * 但配置文件面向用户，使用小写更友好。
 */

/** 合法的思考水平值（运行时校验用） */
export const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;

/** 思考水平类型（从 THINKING_LEVELS 派生，保证类型与运行时一致） */
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** Supported AI provider identifiers. */
export const AI_PROVIDERS = ['gemini', 'codex'] as const;

/** AI provider identifier derived from the runtime allowlist. */
export type AIProviderId = (typeof AI_PROVIDERS)[number];

/** Selects the model marked as default by the active Codex App Server. */
export const CODEX_DEFAULT_MODEL = 'app-default' as const;

/** Selects the default reasoning effort declared by the resolved Codex model. */
export const CODEX_DEFAULT_REASONING_EFFORT = 'model-default' as const;

/** Gemini-specific connection and generation settings. */
export interface GeminiProviderConfig {
  apiKey?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  timeout?: number;
}

/** Codex App Server process, project, and generation settings. */
export interface CodexProviderConfig {
  executable?: string;
  projectPath?: string;
  model?: string;
  reasoningEffort?: string;
  startupTimeout?: number;
  turnTimeout?: number;
  shutdownGrace?: number;
}

/** AI 模块配置 */
export interface AIConfig {
  provider?: AIProviderId;
  gemini?: GeminiProviderConfig;
  codex?: CodexProviderConfig;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试基础延迟（毫秒） */
  baseDelay?: number;
  /** 重试最大延迟（毫秒） */
  maxDelay?: number;

  /** @deprecated Use `gemini.apiKey`. */
  apiKey?: string;
  /** @deprecated Use `gemini.model`. */
  model?: string;
  /** @deprecated Use `gemini.thinkingLevel`. */
  thinkingLevel?: ThinkingLevel;
  /** @deprecated Use `gemini.timeout`. */
  timeout?: number;
}
