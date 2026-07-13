import { logger } from '@/infra/logger';
import type { UserNotice } from './types';

/**
 * Render one structured notice through the diagnostic logger.
 *
 * @param notice - Non-fatal effect with stable code and recovery details.
 * @returns Nothing.
 */
export function renderNotice(notice: UserNotice): void {
  const summary = `[${notice.code}] ${notice.summary}`;
  if (notice.severity === 'warning') {
    logger.warn(summary);
  } else {
    logger.info(summary);
  }

  for (const detail of notice.details ?? []) {
    logger.detail(detail);
  }
  for (const action of notice.actions ?? []) {
    const label = action.type === 'command' ? '恢复命令' : '恢复操作';
    logger.detail(`${label}: ${action.content}`);
    logger.detail(`说明: ${action.description}`);
  }
  if (notice.documentation) {
    logger.detail(`文档: ${notice.documentation}`);
  }
}

/**
 * Render a notice list in its supplied order.
 *
 * @param notices - Notices returned by a command or workflow step.
 * @returns Nothing.
 */
export function renderNotices(notices: readonly UserNotice[] = []): void {
  for (const notice of notices) {
    renderNotice(notice);
  }
}
