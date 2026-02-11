/**
 * 配置文件路径解析
 *
 * 配置目录：~/.v2er-insight/
 * 配置文件：~/.v2er-insight/config.json
 */

import os from 'os';
import path from 'path';

/** 配置目录名 */
const CONFIG_DIR = '.v2er-insight';

/** 配置文件名 */
const CONFIG_FILE = 'config.json';

/** 返回配置目录路径 */
export function getConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR);
}

/** 返回配置文件完整路径 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILE);
}
