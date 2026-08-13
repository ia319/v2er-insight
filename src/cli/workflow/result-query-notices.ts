import type { SelectedResult } from '@/infra/storage';
import { createResultStateNotices } from './result-state-notices';
import type { UserNotice } from './types';

/**
 * Builds notices from the verified relationships behind a selected result.
 *
 * @param username - User whose result is being displayed.
 * @param selection - Result and relationship classifications from the query layer.
 * @returns Stable archive and provenance notices for CLI orchestration.
 */
export function createResultQueryNotices(
  username: string,
  selection: SelectedResult,
): UserNotice[] {
  const notices: UserNotice[] = [];

  switch (selection.archiveState) {
    case 'legacy-current':
      notices.push({
        code: 'RESULT_LEGACY_CURRENT',
        severity: 'info',
        summary: '当前结果没有可验证的版本归档',
        details: ['报告正文仍可查看；版本来源和生成信息保持未知。'],
      });
      break;
    case 'tracked-current-diverged':
      notices.push({
        code: 'RESULT_CURRENT_NOT_LATEST',
        severity: 'warning',
        summary: '当前结果不是归档中的最新版本',
        details: ['展示内容来自 result.json，不会借用归档最新版本的来源信息。'],
      });
      break;
    case 'untracked-current':
      notices.push({
        code: 'RESULT_CURRENT_UNTRACKED',
        severity: 'warning',
        summary: '当前结果不属于任何已索引版本',
        details: ['报告正文仍可查看；版本来源和输入摘要不会被推测。'],
      });
      break;
    case 'unavailable':
      notices.push({
        code: 'RESULT_ARCHIVE_UNAVAILABLE',
        severity: 'warning',
        summary: '结果版本归档无法验证',
        details: ['报告正文仍可查看；归档元数据和输入摘要不会被使用。'],
      });
      break;
    default:
      break;
  }

  if (
    selection.source !== 'legacy' &&
    selection.provenanceState !== 'verified' &&
    selection.provenanceState !== 'legacy-missing'
  ) {
    notices.push({
      code: 'RESULT_PROVENANCE_UNAVAILABLE',
      severity: 'warning',
      summary: '当前结果的动态状态无法验证',
      details: ['不会显示未经关联验证的过期或不完整数据提示。'],
    });
  }

  if (selection.verifiedCurrentResult) {
    notices.push(...createResultStateNotices(username, selection.verifiedCurrentResult));
  }
  return notices;
}
