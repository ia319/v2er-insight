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

/** AI 模块配置 */
export interface AIConfig {
  /** AI 提供商（目前仅支持 gemini） */
  provider?: string;
  /** API 密钥 */
  apiKey?: string;
  /** 模型名称 */
  model?: string;
  /** 思考水平 */
  thinkingLevel?: ThinkingLevel;
  /** AI 请求超时（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试基础延迟（毫秒） */
  baseDelay?: number;
  /** 重试最大延迟（毫秒） */
  maxDelay?: number;
}
