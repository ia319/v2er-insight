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
import { DEFAULT_CONFIG, getConfig } from '@/config';
import type { DataFileType } from './types';
import { getDataFilePath } from './paths';

export type CleanableDataFileType = Extract<DataFileType, 'raw' | 'analyzed'>;
export type CleanupSkipReason =
  | 'retention_disabled'
  | 'missing'
  | 'not_expired'
  | 'metadata_unavailable'
  | 'delete_failed';

export interface CleanupSkippedFile {
  type: CleanableDataFileType;
  reason: CleanupSkipReason;
}

export interface CleanupResult {
  enabled: boolean;
  retentionDays: number;
  deleted: CleanableDataFileType[];
  skipped: CleanupSkippedFile[];
}

const CLEANABLE_TYPES: readonly CleanableDataFileType[] = ['raw', 'analyzed'];

/**
 * 判断文件是否已过期
 * @param filePath - 文件路径
 * @param retentionDays - 保留天数
 * @returns 文件的过期状态；元数据不可读时返回 metadata_unavailable
 */
function getExpirationStatus(
  filePath: string,
  retentionDays: number,
): 'expired' | 'not_expired' | 'metadata_unavailable' {
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    return ageMs > retentionMs ? 'expired' : 'not_expired';
  } catch {
    return 'metadata_unavailable';
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
 * @returns Cleanup policy, deleted files, and explicit skip diagnostics.
 */
export function cleanExpiredData(username: string): CleanupResult {
  const config = getConfig();
  const keepRaw = config.data?.keepRaw ?? DEFAULT_CONFIG.data.keepRaw;
  const retentionDays = Math.max(0, config.data?.rawRetention ?? DEFAULT_CONFIG.data.rawRetention);

  if (keepRaw) {
    return {
      enabled: false,
      retentionDays,
      deleted: [],
      skipped: CLEANABLE_TYPES.map((type) => ({ type, reason: 'retention_disabled' })),
    };
  }

  const deleted: CleanableDataFileType[] = [];
  const skipped: CleanupSkippedFile[] = [];

  for (const type of CLEANABLE_TYPES) {
    const filePath = getDataFilePath(username, type);

    if (!fs.existsSync(filePath)) {
      skipped.push({ type, reason: 'missing' });
      continue;
    }

    const expirationStatus = getExpirationStatus(filePath, retentionDays);
    if (expirationStatus !== 'expired') {
      skipped.push({ type, reason: expirationStatus });
      continue;
    }

    try {
      fs.unlinkSync(filePath);
      deleted.push(type);
    } catch {
      skipped.push({ type, reason: 'delete_failed' });
    }
  }

  return { enabled: true, retentionDays, deleted, skipped };
}
