import { createInterface } from 'node:readline/promises';
import { stdin, stderr } from 'node:process';
import { logger } from '@/infra/logger';
import {
  AISessionMigrationConflictError,
  AISessionMigrationFailedError,
  AISessionPersistError,
  AISessionStoreCorruptError,
  ChatSessionMissingError,
  ensureCodexSessionRegistry,
  getAISessionFilePath,
  getAISessionIndexPath,
  inspectCodexSessionStorage,
  readDataFileResult,
  withCodexExecutionLock,
} from '@/infra/storage';
import { renderNotice } from '../workflow/notices';
import type { ReasonCode, UserNotice } from '../workflow/types';
import { extractErrorDetails } from '../utils/error';
import {
  SessionClearExecutionError,
  SessionDeleteFailedError,
  SessionDeleteUnsupportedError,
  clearConfirmedSessionScope,
  withSessionClearLocks,
} from './session-clear/execution';
import {
  buildSessionClearPreview,
  parseSessionClearProvider,
  resolveConfirmedSessionClearScope,
  sessionClearPreviewsMatch,
  type SessionClearPreviewTarget,
} from './session-clear/scope';

export interface SessionClearOptions {
  provider?: string;
  allVersions?: boolean;
}

export interface SessionClearResult {
  status: 'success' | 'failed' | 'cancelled';
  reasonCode?: ReasonCode;
  deleted: number;
  notices?: UserNotice[];
}

export interface SessionClearDependencies {
  isInteractive(): boolean;
  confirm(): Promise<boolean>;
}

const DEFAULT_DEPENDENCIES: SessionClearDependencies = {
  isInteractive: () => stdin.isTTY === true && stderr.isTTY === true,
  confirm: async () => {
    const prompt = createInterface({ input: stdin, output: stderr });
    try {
      const answer = await prompt.question('输入 yes 确认永久删除以上 session: ');
      return answer.trim() === 'yes';
    } finally {
      prompt.close();
    }
  },
};

function renderClearPreview(username: string, targets: readonly SessionClearPreviewTarget[]): void {
  logger.diagnostic('info', '将永久删除以下 AI session:');
  for (const target of targets) {
    logger.diagnostic(
      'info',
      `  ${target.provider}; generation=${target.generation}; session=${target.localSessionId}`,
    );
    if (target.externalThreadId) {
      logger.diagnostic(
        'info',
        `    Codex thread=${target.externalThreadId}; name=${target.displayName ?? '未命名'}`,
      );
    }
    logger.diagnostic(
      'info',
      `    local=${getAISessionFilePath(username, target.provider, target.localSessionId)}`,
    );
  }
  logger.diagnostic('info', `  retained index=${getAISessionIndexPath(username)}`);
  logger.diagnostic('info', '不会删除 raw、analyzed、result.json 或 results/。');
}

function createSourceMissingNotice(username: string): UserNotice {
  return {
    code: 'SESSION_SOURCE_DATA_MISSING',
    severity: 'warning',
    summary: `${username} 的 analyzed 数据不存在`,
    details: ['清理后无法从当前本地数据恢复这个聊天基线。'],
    actions: [
      {
        type: 'command',
        content: `v2er ${username} --force`,
        description: '需要重新建立会话时，先重新抓取并分析完整数据',
      },
    ],
    documentation: 'docs/ai-conversations.md',
  };
}

function classifyClearFailure(error: unknown): ReasonCode {
  const failure = error instanceof SessionClearExecutionError ? error.failure : error;
  if (failure instanceof ChatSessionMissingError) return 'CHAT_SESSION_MISSING';
  if (failure instanceof TypeError || failure instanceof AISessionStoreCorruptError) {
    return 'CHAT_SESSION_INVALID';
  }
  if (failure instanceof SessionDeleteUnsupportedError) return 'SESSION_DELETE_UNSUPPORTED';
  if (failure instanceof SessionDeleteFailedError) return 'SESSION_DELETE_FAILED';
  if (failure instanceof AISessionPersistError) return 'SESSION_PERSIST_FAILED';
  if (failure instanceof AISessionMigrationConflictError) return 'SESSION_MIGRATION_CONFLICT';
  if (failure instanceof AISessionMigrationFailedError) return 'SESSION_MIGRATION_FAILED';
  return 'SESSION_CLEAR_FAILED';
}

/**
 * Confirms and permanently clears the selected provider sessions without touching result files.
 * @param username - Owner of the selected sessions.
 * @param options - Provider scope and optional all-generation expansion.
 * @param dependencies - Interactive terminal boundary used by tests and the CLI.
 * @returns Clear, cancellation, or failure status with the number of removed sessions.
 */
export async function runSessionClear(
  username: string,
  options: SessionClearOptions,
  dependencies: SessionClearDependencies = DEFAULT_DEPENDENCIES,
): Promise<SessionClearResult> {
  const notices: UserNotice[] = [];
  let deleted = 0;
  try {
    const provider = parseSessionClearProvider(options.provider);
    const preview = buildSessionClearPreview(username, provider, options.allVersions === true);
    renderClearPreview(username, preview);
    if (readDataFileResult(username, 'analyzed').status === 'missing') {
      const notice = createSourceMissingNotice(username);
      notices.push(notice);
      renderNotice(notice);
    }
    if (!dependencies.isInteractive()) {
      const reasonCode: ReasonCode = 'SESSION_CONFIRMATION_REQUIRED';
      logger.error(`[${reasonCode}] session clear 需要交互确认`);
      return { status: 'failed', reasonCode, deleted: 0, notices };
    }
    if (!(await dependencies.confirm())) {
      logger.diagnostic('info', '已取消 session clear；未删除任何内容。');
      return {
        status: 'cancelled',
        reasonCode: 'SESSION_CLEAR_CANCELLED',
        deleted: 0,
        notices,
      };
    }

    const storage = inspectCodexSessionStorage(username);
    const hasCodex = preview.some((target) => target.provider === 'codex');
    const execute = async (): Promise<number> => {
      if (hasCodex || storage.migration === 'pending' || storage.migration === 'conflict') {
        ensureCodexSessionRegistry(username);
      }
      return withSessionClearLocks(username, preview, async () => {
        const scope = resolveConfirmedSessionClearScope(
          username,
          provider,
          options.allVersions === true,
        );
        if (!sessionClearPreviewsMatch(preview, scope.sessions)) {
          throw new AISessionPersistError('AI session clear scope changed after confirmation');
        }
        return clearConfirmedSessionScope(username, scope);
      });
    };
    deleted =
      hasCodex || storage.migration === 'pending' || storage.migration === 'conflict'
        ? await withCodexExecutionLock(username, execute)
        : await execute();
    logger.diagnostic('info', `已永久删除 ${deleted} 个 AI session。`);
    return { status: 'success', deleted, notices };
  } catch (error) {
    if (error instanceof SessionClearExecutionError) deleted = error.deleted;
    const reasonCode = classifyClearFailure(error);
    const { message } = extractErrorDetails(error);
    logger.error(`[${reasonCode}] ${message}`);
    return { status: 'failed', reasonCode, deleted, notices };
  }
}
