import fs from 'fs';
import type { V2erConfig } from './types';
import { getConfigPath } from './path';

/**
 * 读取并解析配置文件
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
 */
export function writeConfig(config: V2erConfig): void {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
