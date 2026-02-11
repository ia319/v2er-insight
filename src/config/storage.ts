/**
 * 配置存储
 *
 * 提供读写配置文件和合并默认值的逻辑。
 * getConfig() 是对外的主要入口，返回默认值与用户设置合并后的完整配置。
 */

import fs from 'fs';
import type { V2erConfig } from './types';
import { getConfigDir, getConfigPath } from './path';
import { DEFAULT_CONFIG } from './defaults';

// -- 内部工具 ----------------------------------------------------------------

/**
 * 深合并两个对象（仅处理普通对象，不处理数组）
 * target 的值会被 source 中的非 undefined 值覆盖
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (sourceVal === undefined) continue;

    if (
      typeof sourceVal === 'object' &&
      sourceVal !== null &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as object, sourceVal as object) as T[keyof T];
    } else {
      result[key] = sourceVal as T[keyof T];
    }
  }

  return result;
}

// -- 公共 API ----------------------------------------------------------------

/**
 * 读取并解析用户配置文件
 * 若文件不存在或解析失败，返回空对象
 */
export function readConfig(): V2erConfig {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as V2erConfig;
  } catch {
    return {};
  }
}

/**
 * 将配置写入文件
 * 自动创建配置目录，使用 0600 权限（Linux/Mac）
 */
export function writeConfig(config: V2erConfig): void {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

/**
 * 获取合并后的完整配置（默认值 + 用户设置）
 * 用户设置会覆盖默认值中的同名字段
 */
export function getConfig(): V2erConfig {
  const userConfig = readConfig();
  return deepMerge({ ...DEFAULT_CONFIG } as V2erConfig, userConfig);
}
