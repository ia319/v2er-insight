import type { CurrentResultState } from '@/core/provenance';
import type { UserNotice } from './types';

/**
 * Build display warnings from validated current-result provenance.
 *
 * @param username - User whose result is being displayed.
 * @param currentResult - Validated result provenance when available.
 * @returns Stale and partial warnings in stable order.
 */
export function createResultStateNotices(
  username: string,
  currentResult?: CurrentResultState,
): UserNotice[] {
  if (!currentResult) {
    return [];
  }

  const notices: UserNotice[] = [];
  const refreshAction = {
    type: 'command' as const,
    content: `v2er ${username} --force`,
    description: '重新抓取、分析并生成与当前数据一致的结果',
  };

  if (currentResult.stale) {
    notices.push({
      code: 'DATA_RESULT_STALE',
      severity: 'warning',
      summary: '当前展示结果已落后于最新数据',
      details: ['result.json 仍可查看，但其分析指纹与当前数据来源不一致。'],
      actions: [refreshAction],
    });
  }

  if (currentResult.basedOnPartial) {
    notices.push({
      code: 'DATA_SNAPSHOT_PARTIAL',
      severity: 'warning',
      summary: '当前展示结果基于不完整抓取数据',
      details: ['缺失记录不能解释为删除，相关结论应降低置信度。'],
      actions: [refreshAction],
    });
  }

  return notices;
}
