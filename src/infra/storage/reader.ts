/**
 * Storage 文件读取
 *
 * 从用户数据目录读取 JSON 文件并解析为对象。
 * 文件不存在或解析失败时返回 null，不抛出异常。
 */

import fs from 'fs';
import type { DataFileType } from './types';
import { getDataFilePath } from './paths';

export type DataFileReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'success'; data: unknown };

/**
 * Reads one JSON data file with explicit missing and invalid states.
 *
 * @param username - V2EX username that owns the data file.
 * @param type - Supported data file type.
 * @returns A typed read status with parsed data on success.
 */
export function readDataFileResult(username: string, type: DataFileType): DataFileReadResult {
  const filePath = getDataFilePath(username, type);

  if (!fs.existsSync(filePath)) {
    return { status: 'missing' };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data: unknown = JSON.parse(content);
    return { status: 'success', data };
  } catch {
    return { status: 'invalid' };
  }
}

/**
 * 读取指定用户的数据文件
 * @param username - V2EX 用户名
 * @param type - 数据文件类型（raw / analyzed / result / analysisState）
 * @returns 解析后的对象，文件不存在或解析失败返回 null
 */
export function readDataFile<T>(username: string, type: DataFileType): T | null {
  const result = readDataFileResult(username, type);
  return result.status === 'success' ? (result.data as T) : null;
}
