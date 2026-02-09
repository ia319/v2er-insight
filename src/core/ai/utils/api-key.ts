/**
 * API Key 解析工具
 *
 * 优先级：
 * 1. 显式传入的参数
 * 2. 用户配置文件 (~/.v2errc.json)
 * 3. 环境变量
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CONFIG_FILE = '.v2errc.json';
const ENV_KEYS = ['GOOGLE_API_KEY', 'GEMINI_API_KEY'] as const;

interface UserConfig {
  geminiApiKey?: string;
}

/**
 * 从 ~/.v2errc.json 加载用户配置
 */
function loadUserConfig(): UserConfig | null {
  const configPath = path.join(os.homedir(), CONFIG_FILE);
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as UserConfig;
    }
  } catch {
    // 忽略配置读取错误
  }
  return null;
}

/**
 * 从多个来源解析 API Key
 *
 * 优先级顺序：显式参数 > 用户配置文件 > 环境变量
 */
export function resolveApiKey(explicit?: string): string | null {
  if (explicit && explicit.trim() !== '') {
    return explicit.trim();
  }

  const config = loadUserConfig();
  if (config?.geminiApiKey) {
    return config.geminiApiKey;
  }

  for (const key of ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}
