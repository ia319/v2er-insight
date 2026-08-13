/**
 * show 命令 — 展示 AI 分析结果
 *
 * 查询当前结果或不可变版本，并以结构化格式输出到终端。
 */

import { type AIAnalysisResult, type PsychologicalProfile } from '@/core/ai';
import {
  queryCurrentResult,
  queryResultHistory,
  queryResultVersion,
  type ResultArchiveCorruption,
  type ResultVersionSummary,
  type SelectedResult,
} from '@/infra/storage';
import { logger } from '@/infra/logger';
import { COLORS } from '@/infra/logger/colors';
import type { ShowCommandOptions } from '../types';
import { getRecoveryActions } from '../workflow/recovery';
import type { ReasonCode, StepRunResult } from '../workflow/types';
import { createResultQueryNotices } from '../workflow/result-query-notices';

// -- 格式化工具 --------------------------------------------------------------

/** OCEAN 五维特质的中文标签 */
const OCEAN_LABELS: Record<keyof PsychologicalProfile['scores'], string> = {
  openness: '开放性',
  conscientiousness: '尽责性',
  extraversion: '外向性',
  agreeableness: '宜人性',
  neuroticism: '神经质',
};

/**
 * 渲染分数条 (0-100)
 *
 * 示例: ████████░░ 80
 */
function renderScoreBar(score: number, width = 10): string {
  if (!Number.isFinite(score)) return '░'.repeat(width) + ' N/A';
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${clamped}`;
}

/** 风险等级对应的显示样式 */
function formatRiskLevel(level: string): string {
  switch (level) {
    case 'safe':
      return `${COLORS.green}安全${COLORS.reset}`;
    case 'suspicious':
      return `${COLORS.yellow}可疑${COLORS.reset}`;
    case 'high_risk':
      return `${COLORS.red}高风险${COLORS.reset}`;
    default:
      return level;
  }
}

// -- 输出模式 ----------------------------------------------------------------

/** --brief: 简略版输出 */
function printBrief(result: AIAnalysisResult): void {
  console.log(`\n${COLORS.bold}${COLORS.cyan}=== 用户画像摘要 ===${COLORS.reset}\n`);
  console.log(result.summary);

  console.log(`\n${COLORS.bold}关键指标${COLORS.reset}`);
  console.log(`  职业方向: ${result.professional.career_path}`);
  console.log(`  技术水平: ${result.professional.level}`);
  console.log(`  人生阶段: ${result.personal.life_stage}`);
  console.log(`  风险评估: ${formatRiskLevel(result.risk.level)}`);
}

/** 默认: 完整格式化输出 */
function printFull(result: AIAnalysisResult): void {
  // Summary
  console.log(`\n${COLORS.bold}${COLORS.cyan}=== 用户画像分析 ===${COLORS.reset}\n`);
  console.log(result.summary);

  // Professional
  console.log(`\n${COLORS.bold}[职业画像]${COLORS.reset}`);
  console.log(`  方向: ${result.professional.career_path}`);
  console.log(`  水平: ${result.professional.level}`);
  console.log(`  技术栈: ${(result.professional.tech_stack ?? []).join(', ')}`);
  console.log(`  专注一致性: ${result.professional.focus_coherence}`);
  const timeline = result.professional.evolution?.timeline ?? [];
  if (timeline.length > 0) {
    console.log(`  ${COLORS.gray}演变轨迹:${COLORS.reset}`);
    for (const entry of timeline) {
      console.log(`    ${entry.period} → ${entry.focus}`);
    }
  }

  // Personal
  console.log(`\n${COLORS.bold}[个人生活]${COLORS.reset}`);
  console.log(`  人生阶段: ${result.personal.life_stage}`);
  console.log(`  兴趣爱好: ${(result.personal.hobbies ?? []).join(', ')}`);
  console.log(`  价值取向: ${(result.personal.values ?? []).join(', ')}`);

  // Psychological (OCEAN)
  console.log(`\n${COLORS.bold}[心理画像 — OCEAN]${COLORS.reset}`);
  const { scores } = result.psychological;
  for (const [key, label] of Object.entries(OCEAN_LABELS)) {
    const score = scores[key as keyof typeof scores];
    console.log(`  ${label.padEnd(4)} ${renderScoreBar(score)}`);
  }
  console.log(`  关键词: ${(result.psychological.keywords ?? []).join(', ')}`);

  // Behavioral
  console.log(`\n${COLORS.bold}[行为画像]${COLORS.reset}`);
  console.log(`  社区角色: ${result.behavioral.role}`);
  console.log(`  互动风格: ${result.behavioral.interaction_style}`);
  console.log(`  活跃模式: ${result.behavioral.active_pattern}`);
  console.log(`  热度敏感: ${result.behavioral.heat_sensitivity}`);

  // Social
  console.log(`\n${COLORS.bold}[社交画像]${COLORS.reset}`);
  console.log(`  内容吸引力: ${result.social.content_appeal}`);
  console.log(`  讨论深度: ${result.social.discussion_depth}`);

  // Risk
  console.log(`\n${COLORS.bold}[风险评估]${COLORS.reset}`);
  console.log(`  等级: ${formatRiskLevel(result.risk.level)}`);
  console.log(`  理由: ${result.risk.reason}`);

  console.log('');
}

interface HistoryColumn {
  title: string;
  width: number;
  value: (summary: ResultVersionSummary) => string;
}

const HISTORY_COLUMNS: HistoryColumn[] = [
  { title: '版本', width: 10, value: ({ versionId }) => versionId },
  { title: '生成时间', width: 24, value: ({ createdAt }) => createdAt ?? 'unknown' },
  { title: '来源', width: 18, value: ({ origin }) => origin },
  { title: 'Provider', width: 10, value: ({ provider }) => provider },
  { title: '模型', width: 20, value: ({ model }) => model ?? 'unknown' },
  { title: '会话', width: 20, value: ({ sessionName }) => sessionName ?? 'unknown' },
  { title: '数据质量', width: 10, value: ({ dataQuality }) => dataQuality },
  {
    title: '警告',
    width: 6,
    value: ({ warningCount }) => (warningCount === null ? '?' : String(warningCount)),
  },
  { title: '当前', width: 4, value: ({ isCurrent }) => (isCurrent ? '*' : '') },
];

const WIDE_TERMINAL_CHARACTER =
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u;

function getTerminalWidth(value: string): number {
  return [...value].reduce(
    (width, character) => width + (WIDE_TERMINAL_CHARACTER.test(character) ? 2 : 1),
    0,
  );
}

function formatHistoryCell(value: string, width: number): string {
  const shouldTruncate = getTerminalWidth(value) > width;
  const contentWidth = shouldTruncate ? width - 1 : width;
  let display = '';
  let displayWidth = 0;

  // Terminal columns count common CJK glyphs twice, unlike JavaScript string length.
  for (const character of value) {
    const characterWidth = WIDE_TERMINAL_CHARACTER.test(character) ? 2 : 1;
    if (displayWidth + characterWidth > contentWidth) break;
    display += character;
    displayWidth += characterWidth;
  }
  if (shouldTruncate) {
    display += '…';
    displayWidth += 1;
  }
  return `${display}${' '.repeat(Math.max(0, width - displayWidth))}`;
}

function printHistory(summaries: ResultVersionSummary[]): void {
  console.log(`\n${COLORS.bold}${COLORS.cyan}=== 结果版本历史 ===${COLORS.reset}\n`);
  console.log(HISTORY_COLUMNS.map(({ title, width }) => formatHistoryCell(title, width)).join(' '));
  console.log(HISTORY_COLUMNS.map(({ width }) => '-'.repeat(width)).join(' '));
  for (const summary of summaries) {
    console.log(
      HISTORY_COLUMNS.map(({ width, value }) => formatHistoryCell(value(summary), width)).join(' '),
    );
  }
}

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

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return {
      step: 'show',
      status: 'success',
      message: '已输出 JSON 结果',
      meta: { mode: 'json', ...resultMeta },
      notices,
    };
  }

  if (options.brief) {
    printBrief(result);
    return {
      step: 'show',
      status: 'success',
      message: '已输出简略报告',
      meta: { mode: 'brief', ...resultMeta },
      notices,
    };
  }

  printFull(result);
  return {
    step: 'show',
    status: 'success',
    message: '已输出完整报告',
    meta: { mode: 'full', ...resultMeta },
    notices,
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
      printHistory(history.summaries);
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
