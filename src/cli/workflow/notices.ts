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
    logger.diagnostic('info', summary);
  }

  const diagnosticLevel = notice.severity === 'warning' ? 'warn' : 'info';

  for (const detail of notice.details ?? []) {
    logger.diagnostic(diagnosticLevel, `  ${detail}`);
  }
  for (const action of notice.actions ?? []) {
    const label = action.type === 'command' ? '恢复命令' : '恢复操作';
    logger.diagnostic(diagnosticLevel, `  ${label}: ${action.content}`);
    logger.diagnostic(diagnosticLevel, `  说明: ${action.description}`);
  }
  if (notice.documentation) {
    logger.diagnostic(diagnosticLevel, `  文档: ${notice.documentation}`);
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
