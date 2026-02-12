/**
 * Storage 路径解析
 *
 * 数据目录结构：
 *   ~/.v2er-insight/data/{username}/
 *     ├── raw.json       # 抓取的原始数据
 *     ├── analyzed.json   # Analyzer 输出
 *     └── result.json     # AI 分析结果
 */

import path from 'path';
import { getConfigDir } from '@/config/path';
import type { DataFileType } from './types';
import { DATA_FILE_NAMES } from './types';

/** 数据根目录名 */
const DATA_DIR = 'data';

/**
 * 获取用户数据目录路径
 * @param username - V2EX 用户名
 * @returns 如 ~/.v2er-insight/data/livid/
 */
export function getUserDataDir(username: string): string {
  return path.join(getConfigDir(), DATA_DIR, username);
}

/**
 * 获取指定用户的数据文件路径
 * @param username - V2EX 用户名
 * @param type - 数据文件类型
 * @returns 如 ~/.v2er-insight/data/livid/raw.json
 */
export function getDataFilePath(username: string, type: DataFileType): string {
  return path.join(getUserDataDir(username), DATA_FILE_NAMES[type]);
}
