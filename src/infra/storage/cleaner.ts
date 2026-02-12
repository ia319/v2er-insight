/**
 * Storage 过期数据清理
 *
 * 根据配置清理过期的原始数据文件（raw.json / analyzed.json）。
 * result.json 永远不会被清理。
 *
 * 清理策略：
 * - keepRaw=true → 永不清理
 * - keepRaw=false → 检查文件 mtime，超过 rawRetention 天则删除
 */

import fs from 'fs';
import { getConfig } from '@/config';
import type { DataFileType } from './types';
import { getDataFilePath } from './paths';

/** 需要清理的文件类型（result 永不清理） */
const CLEANABLE_TYPES: DataFileType[] = ['raw', 'analyzed'];

/**
 * 判断文件是否已过期
 * @param filePath - 文件路径
 * @param retentionDays - 保留天数
 * @returns true 表示文件已过期，应被清理
 */
function isExpired(filePath: string, retentionDays: number): boolean {
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    return ageMs > retentionMs;
  } catch {
    return false;
  }
}

/**
 * 清理指定用户的过期数据文件
 *
 * 根据 config.data.keepRaw 和 config.data.rawRetention 决定清理行为：
 * - keepRaw=true：不做任何操作
 * - keepRaw=false：删除超过 rawRetention 天的 raw.json 和 analyzed.json
 * - result.json 永远不受影响
 *
 * @param username - V2EX 用户名
 * @returns 被删除的文件类型列表
 */
export function cleanExpiredData(username: string): DataFileType[] {
  const config = getConfig();
  const keepRaw = config.data?.keepRaw ?? false;
  const retentionDays = Math.max(0, config.data?.rawRetention ?? 1);

  // 永久保留模式，不清理
  if (keepRaw) {
    return [];
  }

  const deleted: DataFileType[] = [];

  for (const type of CLEANABLE_TYPES) {
    const filePath = getDataFilePath(username, type);

    if (fs.existsSync(filePath) && isExpired(filePath, retentionDays)) {
      try {
        fs.unlinkSync(filePath);
        deleted.push(type);
      } catch {
        // 文件可能在检查后被外部删除，忽略 ENOENT
      }
    }
  }

  return deleted;
}
