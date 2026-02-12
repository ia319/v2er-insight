/**
 * Storage 文件写入
 *
 * 将数据写入用户数据目录的 JSON 文件。
 * 自动创建目录，默认格式化输出。
 */

import fs from 'fs';
import type { DataFileType } from './types';
import type { WriteOptions } from './types';
import { getDataFilePath } from './paths';
import { getUserDataDir } from './paths';

/**
 * 写入指定用户的数据文件
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

  // 自动创建用户数据目录
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

  fs.writeFileSync(filePath, content, { encoding: 'utf-8' });
}
