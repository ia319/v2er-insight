/**
 * show 命令 — 展示 AI 分析结果
 *
 * 查询当前结果或不可变版本，并以结构化格式输出到终端。
 */

import {
  queryCurrentResult,
  queryResultHistory,
  queryResultVersion,
  type ResultArchiveCorruption,
  type SelectedResult,
} from '@/infra/storage';
import { logger } from '@/infra/logger';
import type { ShowCommandOptions } from '../types';
import { renderNotices } from '../workflow/notices';
import { getRecoveryActions } from '../workflow/recovery';
import type { ReasonCode, StepRunResult } from '../workflow/types';
import { createResultQueryNotices } from '../workflow/result-query-notices';
import { renderBriefResult, renderFullResult, renderResultHistory } from './show/renderers';

function createShowFailure(
  username: string,
  reasonCode: ReasonCode,
  message: string,
): StepRunResult {
  return {
    step: 'show',
    status: 'failed',
    reasonCode,
    message,
    recoverable: true,
    recoverActions: getRecoveryActions(reasonCode, { username }),
  };
}

function createBusyFailure(username: string): StepRunResult {
  logger.error(`${username} 的结果版本正在更新，请稍后重试`);
  return createShowFailure(
    username,
    'RESULT_VERSION_BUSY',
    '查询期间结果版本仍在变化，未输出可能混合的数据',
  );
}

function createCorruptFailure(
  username: string,
  corruption: ResultArchiveCorruption,
): StepRunResult {
  if (corruption.reason === 'unreadable') {
    logger.debug(
      `结果归档读取失败: ${corruption.error instanceof Error ? corruption.error.message : String(corruption.error)}`,
    );
  }
  logger.error(`${username} 的结果版本归档损坏或无法验证`);
  return createShowFailure(
    username,
    'RESULT_VERSION_CORRUPT',
    '结果版本归档缺失、损坏或关联不一致，未输出不完整查询结果',
  );
}

function hasInvalidOptionCombination(options: ShowCommandOptions): boolean {
  return Boolean(
    (options.json && options.brief) ||
    (options.history && options.brief) ||
    (options.history && options.version !== undefined),
  );
}

function displaySelection(
  username: string,
  selection: SelectedResult,
  options: ShowCommandOptions,
): StepRunResult {
  const result = selection.result;
  const notices = createResultQueryNotices(username, selection);
  const resultMeta = {
    source: selection.source,
    archiveState: selection.archiveState,
    provenanceState: selection.provenanceState,
    versionId: selection.metadata?.versionId ?? null,
  };
  renderNotices(notices);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return {
      step: 'show',
      status: 'success',
      message: '已输出 JSON 结果',
      meta: { mode: 'json', ...resultMeta },
      notices,
      noticesRendered: true,
    };
  }

  if (options.brief) {
    console.log(renderBriefResult(selection));
    return {
      step: 'show',
      status: 'success',
      message: '已输出简略报告',
      meta: { mode: 'brief', ...resultMeta },
      notices,
      noticesRendered: true,
    };
  }

  console.log(renderFullResult(selection));
  return {
    step: 'show',
    status: 'success',
    message: '已输出完整报告',
    meta: { mode: 'full', ...resultMeta },
    notices,
    noticesRendered: true,
  };
}

// -- 命令入口 ----------------------------------------------------------------

/**
 * Displays the current result, saved history, or one immutable version.
 *
 * @param username - User associated with the displayed result.
 * @param options - Selection and output mode options.
 * @returns Structured show status with any result-provenance notices.
 */
export async function runShow(
  username: string,
  options: ShowCommandOptions,
): Promise<StepRunResult> {
  if (hasInvalidOptionCombination(options)) {
    logger.error('show 选项组合无效');
    return createShowFailure(
      username,
      'SHOW_INVALID_OPTION_COMBINATION',
      '--json、--brief、--history 和 --version 的组合无效',
    );
  }

  if (options.history) {
    const history = queryResultHistory(username);
    if (history.status === 'busy') return createBusyFailure(username);
    if (history.status === 'corrupt') return createCorruptFailure(username, history);
    if (history.status === 'empty') {
      logger.error(`未找到 ${username} 的结果版本历史`);
      return createShowFailure(username, 'SHOW_HISTORY_EMPTY', '没有可展示的结果版本');
    }

    if (options.json) {
      console.log(JSON.stringify(history.summaries, null, 2));
    } else {
      console.log(renderResultHistory(history.summaries));
    }
    return {
      step: 'show',
      status: 'success',
      message: '已输出结果版本历史',
      meta: {
        mode: 'history',
        format: options.json ? 'json' : 'table',
        count: history.summaries.length,
      },
    };
  }

  if (options.version !== undefined) {
    const version = queryResultVersion(username, options.version);
    if (version.status === 'busy') return createBusyFailure(username);
    if (version.status === 'corrupt') return createCorruptFailure(username, version);
    if (version.status === 'not-found') {
      logger.error(`未找到 ${username} 的结果版本 ${options.version}`);
      return createShowFailure(
        username,
        'SHOW_VERSION_NOT_FOUND',
        `结果版本 ${options.version} 不存在或 ID 格式无效`,
      );
    }
    return displaySelection(username, version.selection, options);
  }

  const query = queryCurrentResult(username);

  if (query.status === 'missing') {
    logger.error(`未找到 ${username} 的分析结果`);
    if (query.latestVersionId) {
      logger.info(`归档中仍有版本 ${query.latestVersionId}`);
      return {
        ...createShowFailure(username, 'SHOW_RESULT_MISSING', '缺少 result.json，无法展示当前报告'),
        recoverActions: [
          {
            type: 'command',
            content: `v2er show ${username} --history`,
            description: '列出仍可验证的结果版本',
          },
          {
            type: 'command',
            content: `v2er show ${username} --version ${query.latestVersionId}`,
            description: '直接查看归档中的最新版本',
          },
        ],
      };
    }
    logger.info(`请先运行: v2er ai ${username}`);
    return createShowFailure(username, 'SHOW_RESULT_MISSING', '缺少 result.json，无法展示报告');
  }

  if (query.status === 'invalid') {
    if (query.reason === 'unreadable') {
      logger.debug(
        `result.json 读取失败: ${query.error instanceof Error ? query.error.message : String(query.error)}`,
      );
    }
    logger.error(`${username} 的 result.json 无法读取、格式无效或不受支持`);
    return createShowFailure(
      username,
      'SHOW_RESULT_INVALID',
      'result.json 无法读取、格式无效或不受支持，无法展示报告',
    );
  }

  if (query.status === 'busy') {
    return createBusyFailure(username);
  }
  return displaySelection(username, query.selection, options);
}
