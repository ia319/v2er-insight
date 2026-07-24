/**
 * API Key 解析工具
 *
 * 优先级：
 * 1. 显式传入的参数
 * 2. 配置文件中的 Gemini provider API Key
 * 3. 环境变量 GOOGLE_API_KEY / GEMINI_API_KEY
 */

import { getConfig } from '@/config';
import { resolveGeminiConfig } from '@/config/ai';

const ENV_KEYS = ['GOOGLE_API_KEY', 'GEMINI_API_KEY'] as const;

/**
 * 从多个来源解析 API Key
 *
 * 优先级顺序：显式参数 > 配置文件 > 环境变量
 */
export function resolveApiKey(explicit?: string): string | null {
  if (explicit && explicit.trim() !== '') {
    return explicit.trim();
  }

  const config = getConfig();
  const configKey = resolveGeminiConfig(config.ai).apiKey;
  if (configKey && configKey.trim() !== '') {
    return configKey.trim();
  }

  for (const key of ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}
