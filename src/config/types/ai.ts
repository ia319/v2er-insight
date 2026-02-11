/**
 * AI 模块配置类型
 */

import type { ThinkingLevel } from '@google/genai';

export type { ThinkingLevel };

/** AI 模块配置 */
export interface AIConfig {
  /** AI 提供商（目前仅支持 gemini） */
  provider?: string;
  /** API 密钥 */
  apiKey?: string;
  /** 模型名称 */
  model?: string;
  /** 思考水平（对应 @google/genai ThinkingLevel 枚举） */
  thinking?: ThinkingLevel;
  /** AI 请求超时（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试基础延迟（毫秒） */
  baseDelay?: number;
  /** 重试最大延迟（毫秒） */
  maxDelay?: number;
}
