/**
 * Storage 文件写入
 *
 * 通过同目录临时文件和原子 rename 写入用户 JSON 数据。
 * 自动创建目录，默认格式化输出。
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import type { DataFileType, WriteOptions } from './types';
import { getDataFilePath, getUserDataDir } from './paths';

/**
 * 原子写入指定用户的数据文件
 * @param username - V2EX 用户名
 * @param type - 数据文件类型（raw / analyzed / result）
 * @param data - 要写入的数据对象
 * @param options - 写入选项
 */
export function writeDataFile(
  username: string,
  type: DataFileType,
  data: unknown,
  options: WriteOptions = {},
): void {
  const { pretty = true } = options;

  const dataDir = getUserDataDir(username);
  const filePath = getDataFilePath(username, type);
  const tempPath = path.join(
    dataDir,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  // recursive: true covers existing and newly created directories.
  fs.mkdirSync(dataDir, { recursive: true });

  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

  try {
    fs.writeFileSync(tempPath, content, {
      encoding: 'utf-8',
      mode: 0o600,
      flag: 'wx',
    });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // A creation failure can leave the temporary path absent.
    }
    throw error;
  }
}
