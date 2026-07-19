/**
 * Storage 路径解析
 *
 * 数据目录结构：
 *   ~/.v2er-insight/data/{username}/
 *     ├── raw.json       # 抓取的原始数据
 *     ├── analyzed.json   # Analyzer 输出
 *     ├── result.json     # AI 分析结果
 *     ├── analysis-state.json # 持久化 provenance 状态
 *     └── codex-sessions.json # Codex thread 注册表
 */

import path from 'path';
import { getConfigDir } from '@/config/path';
import type { DataFileType } from './types';
import { DATA_FILE_NAMES } from './types';

/** 数据根目录名 */
const DATA_DIR = 'data';

/** 合法用户名格式：仅允许字母、数字、下划线、连字符 */
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Resolves the shared root directory for persisted user data.
 * @returns The data directory under the configured application directory.
 */
export function getDataRootDir(): string {
  return path.join(getConfigDir(), DATA_DIR);
}

/**
 * 校验用户名是否合法
 * @throws Error 用户名包含非法字符时抛出
 */
function validateUsername(username: string): void {
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(`用户名 "${username}" 包含非法字符，仅允许字母、数字、下划线和连字符`);
  }
}

/**
 * 获取用户数据目录路径
 * @param username - V2EX 用户名
 * @returns 如 ~/.v2er-insight/data/livid/
 * @throws Error 用户名包含非法字符时抛出
 */
export function getUserDataDir(username: string): string {
  validateUsername(username);
  return path.join(getDataRootDir(), username);
}

/**
 * 获取指定用户的数据文件路径
 * @param username - V2EX 用户名
 * @param type - 数据文件类型
 * @returns 如 ~/.v2er-insight/data/livid/raw.json
 * @throws Error 用户名包含非法字符时抛出
 */
export function getDataFilePath(username: string, type: DataFileType): string {
  return path.join(getUserDataDir(username), DATA_FILE_NAMES[type]);
}
