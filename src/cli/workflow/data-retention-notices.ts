import { DATA_FILE_NAMES, type CleanupResult } from '@/infra/storage';
import type { UserNotice } from './types';

const DATA_LIFECYCLE_DOCUMENTATION = 'docs/data-lifecycle.md';

function buildRetentionDetails(): string[] {
  return [
    '超过保留期的 raw.json 和 analyzed.json 会被删除；result.json 和 analysis-state.json 保留。',
    '已持有完整数据历史的外部会话可以继续；重发或重新建立上下文需要可读取的 analyzed.json。',
  ];
}

/**
 * Describe the effects of enabling automatic source-data cleanup.
 *
 * @param retentionDays - Configured source-data retention period.
 * @returns A stable warning notice for config commands.
 */
export function createDataRetentionEnabledNotice(retentionDays: number): UserNotice {
  return {
    code: 'DATA_RETENTION_ENABLED',
    severity: 'warning',
    summary: `已启用 ${retentionDays} 天源数据自动清理`,
    details: buildRetentionDetails(),
    actions: [
      {
        type: 'command',
        content: 'v2er <username> --force',
        description: '源数据已清理时重新抓取并生成 analyzed.json',
      },
    ],
    documentation: DATA_LIFECYCLE_DOCUMENTATION,
  };
}

/**
 * Describe source files removed by one completed cleanup pass.
 *
 * @param username - User whose source files were evaluated.
 * @param cleanup - Structured cleanup result from storage.
 * @returns A warning notice when files were deleted, otherwise null.
 */
export function createDataFilesCleanedNotice(
  username: string,
  cleanup: CleanupResult,
): UserNotice | null {
  if (cleanup.deleted.length === 0) {
    return null;
  }

  const files = cleanup.deleted.map((type) => DATA_FILE_NAMES[type]).join('、');
  return {
    code: 'DATA_FILES_CLEANED',
    severity: 'warning',
    summary: `已按 ${cleanup.retentionDays} 天保留期清理 ${files}`,
    details: buildRetentionDetails(),
    actions: [
      {
        type: 'command',
        content: `v2er ${username} --force`,
        description: '重新抓取并生成可用于重发或重建上下文的 analyzed.json',
      },
    ],
    documentation: DATA_LIFECYCLE_DOCUMENTATION,
  };
}
