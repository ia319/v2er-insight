/**
 * 配置默认值
 *
 * 定义所有配置项的默认值。
 * getConfig() 会将用户设置覆盖到这些默认值上。
 *
 * 注意：
 * - proxy、ai.apiKey 无默认值，必须由用户设置
 * - 各模块内部的 config.ts 硬编码值应与此保持一致
 */

import type { V2erConfig } from './types';

/**
 * 合并默认值后的配置类型
 * - 对象类型的字段（如 ai、fetch）：所有子字段变为必填
 * - 原始类型的字段（如 proxy）：key 必须存在，但值仍可能为 undefined
 */
export type ResolvedConfig = Required<{
  [K in keyof V2erConfig]: V2erConfig[K] extends object | undefined
    ? Required<NonNullable<V2erConfig[K]>>
    : V2erConfig[K];
}>;

/** 全局默认配置 */
export const DEFAULT_CONFIG = {
  ai: {
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    thinkingLevel: 'high' as const,
    timeout: 60_000,
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10_000,
  },
  fetch: {
    timeout: 30_000,
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 8000,
  },
  analyzer: {
    inactivityThreshold: 60,
    chunkMaxTopics: 20,
    chunkMaxReplies: 100,
    nodeDistributionTopN: 3,
  },
  data: {
    keepRaw: true,
    rawRetention: 1,
  },
  log: {
    level: 'info' as const,
  },
} as const satisfies Partial<V2erConfig>;
