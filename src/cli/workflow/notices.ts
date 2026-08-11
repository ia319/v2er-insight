import { logger } from '@/infra/logger';
import type { RecoveryAction, UserNotice } from './types';

/**
 * Renders recovery actions through the diagnostic logger.
 *
 * @param actions - Ordered command or instruction actions for a failed operation.
 * @returns Nothing.
 */
export function renderRecoveryActions(actions: readonly RecoveryAction[] = []): void {
  if (actions.length === 0) return;

  logger.info('恢复建议:');
  for (const action of actions) {
    const label = action.type === 'command' ? '命令' : '操作';
    logger.detail(`${label}: ${action.content}`);
    logger.detail(`说明: ${action.description}`);
  }
}

/**
 * Renders one structured notice through the diagnostic logger.
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
 * Renders a notice list in its supplied order.
 *
 * @param notices - Notices returned by a command or workflow step.
 * @returns Nothing.
 */
export function renderNotices(notices: readonly UserNotice[] = []): void {
  for (const notice of notices) {
    renderNotice(notice);
  }
}
