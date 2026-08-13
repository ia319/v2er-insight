import type { AIAnalysisResult, PsychologicalProfile } from '@/core/ai';
import type { ResultInputSummary } from '@/core/result-version';
import type { ResultVersionSummary, SelectedResult } from '@/infra/storage';
import { COLORS } from '@/infra/logger/colors';

const OCEAN_LABELS: Record<keyof PsychologicalProfile['scores'], string> = {
  openness: '开放性',
  conscientiousness: '尽责性',
  extraversion: '外向性',
  agreeableness: '宜人性',
  neuroticism: '神经质',
};

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
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function renderScoreBar(score: number, width = 10): string {
  if (!Number.isFinite(score)) return `${'░'.repeat(width)} N/A`;
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round((clamped / 100) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${clamped}`;
}

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

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : '未提供';
}

function formatNullable(value: string | number | null): string {
  return value === null || value === '' ? 'unknown' : String(value);
}

function formatElapsedDays(start: string, end: string): string {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return 'unknown';
  }
  return `约 ${Math.floor((endTime - startTime) / MILLISECONDS_PER_DAY)} 天`;
}

function formatCollectionQuality(quality: ResultInputSummary['dataQuality']['topics']): string {
  return `${quality.status}；已抓取 ${quality.fetchedCount}；预期 ${formatNullable(quality.totalExpected)}；失败 ${quality.failedCount}`;
}

function formatNodeDistribution(distribution: Record<string, number>): string {
  const entries = Object.entries(distribution);
  return entries.length > 0
    ? entries.map(([node, count]) => `${node} (${count})`).join(', ')
    : '未提供';
}

function formatVersion(selection: SelectedResult): string {
  if (selection.metadata) return selection.metadata.versionId;
  switch (selection.archiveState) {
    case 'legacy-current':
      return 'v000001（虚拟 legacy）';
    case 'untracked-current':
      return 'untracked current';
    default:
      return 'unknown';
  }
}

function formatSource(selection: SelectedResult): string {
  if (selection.metadata) return selection.metadata.origin;
  return selection.archiveState === 'legacy-current'
    ? 'legacy'
    : selection.archiveState === 'untracked-current'
      ? 'untracked-current'
      : 'unknown';
}

function renderResultInfo(selection: SelectedResult): string[] {
  const metadata = selection.metadata;
  return [
    `${COLORS.bold}[结果信息]${COLORS.reset}`,
    `  版本: ${formatVersion(selection)}`,
    `  生成时间: ${metadata?.createdAt ?? 'unknown'}`,
    `  归档保存时间: ${metadata?.savedAt ?? 'unknown'}`,
    `  Provider: ${metadata?.provider ?? 'unknown'}`,
    `  模型: ${metadata?.model ?? 'unknown'}`,
    `  Reasoning: ${metadata?.reasoningLevel ?? 'unknown'}`,
    `  会话: ${metadata?.threadName ?? metadata?.localSessionId ?? 'unknown'}`,
    `  来源: ${formatSource(selection)}`,
    `  数据质量: ${metadata?.dataQuality ?? 'unknown'}`,
    `  归档状态: ${selection.archiveState}`,
    `  Provenance: ${selection.provenanceState}`,
    `  当前版本: ${selection.isCurrent === null ? 'unknown' : selection.isCurrent ? '是' : '否'}`,
  ];
}

function renderTargetUser(selection: SelectedResult): string[] {
  const lines = [`${COLORS.bold}[目标用户]${COLORS.reset}`, `  用户名: ${selection.username}`];
  const summary = selection.inputSummary;
  if (!summary) {
    lines.push('  账号与活动事实: 该版本未保存输入摘要');
    return lines;
  }

  const overview = summary.userOverview;
  const capturedAt = summary.dataQuality.capturedAt;
  lines.push(
    `  注册时间: ${formatNullable(overview.joinDate)}`,
    `  抓取时间: ${formatNullable(capturedAt)}`,
    `  抓取时账号年龄: ${formatElapsedDays(overview.joinDate, capturedAt)}`,
    `  最后活跃时间: ${formatNullable(overview.lastActiveTime)}`,
    `  距抓取时最后活动: ${formatElapsedDays(overview.lastActiveTime, capturedAt)}`,
    `  抓取时当日排名: ${formatNullable(overview.dailyRanking)}`,
    `  帖子数: ${formatNullable(overview.totalTopics)}`,
    `  回复数: ${formatNullable(overview.totalReplies)}`,
    `  帖回比: ${overview.topicReplyRatio === null ? 'unknown' : overview.topicReplyRatio.toFixed(2)}`,
    `  主题隐藏: ${overview.isTopicsHidden ? '是' : '否'}`,
    '',
    `${COLORS.bold}[抓取覆盖]${COLORS.reset}`,
    `  帖子: ${formatCollectionQuality(summary.dataQuality.topics)}`,
    `  回复: ${formatCollectionQuality(summary.dataQuality.replies)}`,
  );
  return lines;
}

function renderActivityPeriods(summary: ResultInputSummary): string[] {
  const activity = summary.activitySummary;
  const lines = [
    `${COLORS.bold}[活跃期]${COLORS.reset}`,
    `  总数: ${activity.totalPeriods}`,
    `  分段规则: 连续活动间隔超过 ${summary.analyzerConfig.inactivityThresholdDays} 天时开始新活跃期`,
  ];

  if (activity.periods.length === 0) {
    lines.push('  活跃期明细: 未提供');
    return lines;
  }

  for (const [index, period] of activity.periods.entries()) {
    lines.push(
      `  ${index + 1}. ${period.timeRange}`,
      `     帖子 ${period.topicCount}；回复 ${period.replyCount}`,
      `     主要发帖节点: ${formatNodeDistribution(period.topicNodeDistribution)}`,
      `     主要回复节点: ${formatNodeDistribution(period.replyNodeDistribution)}`,
    );
  }
  return lines;
}

function renderProfile(result: AIAnalysisResult): string[] {
  const lines = [
    `${COLORS.bold}${COLORS.cyan}=== 用户画像分析 ===${COLORS.reset}`,
    '',
    result.summary,
    '',
    `${COLORS.bold}[职业画像]${COLORS.reset}`,
    `  方向: ${result.professional.career_path}`,
    `  水平: ${result.professional.level}`,
    `  技术栈: ${formatList(result.professional.tech_stack)}`,
    `  专注一致性: ${result.professional.focus_coherence}`,
    `  演变概述: ${result.professional.evolution.summary}`,
  ];

  if (result.professional.evolution.timeline.length > 0) {
    lines.push(`  ${COLORS.gray}演变轨迹:${COLORS.reset}`);
    for (const entry of result.professional.evolution.timeline) {
      lines.push(`    ${entry.period} → ${entry.focus}`);
    }
  } else {
    lines.push('  演变轨迹: 未提供');
  }

  lines.push(
    '',
    `${COLORS.bold}[个人生活]${COLORS.reset}`,
    `  人生阶段: ${result.personal.life_stage}`,
    `  兴趣爱好: ${formatList(result.personal.hobbies)}`,
    `  价值取向: ${formatList(result.personal.values)}`,
    '',
    `${COLORS.bold}[心理画像 — OCEAN 推断分数]${COLORS.reset}`,
  );
  for (const [key, label] of Object.entries(OCEAN_LABELS)) {
    lines.push(
      `  ${label.padEnd(4)} ${renderScoreBar(result.psychological.scores[key as keyof PsychologicalProfile['scores']])}`,
    );
  }
  lines.push(
    `  关键词: ${formatList(result.psychological.keywords)}`,
    '',
    `${COLORS.bold}[行为画像]${COLORS.reset}`,
    `  社区角色: ${result.behavioral.role}`,
    `  互动风格: ${result.behavioral.interaction_style}`,
    `  活跃模式: ${result.behavioral.active_pattern}`,
    `  热度敏感: ${result.behavioral.heat_sensitivity}`,
    '',
    `${COLORS.bold}[社交画像]${COLORS.reset}`,
    `  内容吸引力: ${result.social.content_appeal}`,
    `  讨论深度: ${result.social.discussion_depth}`,
    '',
    `${COLORS.bold}[风险评估]${COLORS.reset}`,
    `  等级: ${formatRiskLevel(result.risk.level)}`,
    `  理由: ${result.risk.reason}`,
  );
  return lines;
}

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

/**
 * Renders one selected result as a complete human-readable report.
 * @param selection - Verified query selection and its available context.
 * @returns Terminal-formatted report without performing I/O.
 */
export function renderFullResult(selection: SelectedResult): string {
  return [
    '',
    ...renderResultInfo(selection),
    '',
    ...renderTargetUser(selection),
    ...(selection.inputSummary ? ['', ...renderActivityPeriods(selection.inputSummary)] : []),
    '',
    ...renderProfile(selection.result),
    '',
  ].join('\n');
}

/**
 * Renders one selected result as a compact report with essential context.
 * @param selection - Verified query selection and its available context.
 * @returns Terminal-formatted brief report without performing I/O.
 */
export function renderBriefResult(selection: SelectedResult): string {
  const { result, inputSummary, metadata } = selection;
  const lines = [
    '',
    `${COLORS.bold}${COLORS.cyan}=== 用户画像摘要 ===${COLORS.reset}`,
    '',
    `  用户名: ${selection.username}`,
    `  版本: ${formatVersion(selection)}`,
    `  生成时间: ${metadata?.createdAt ?? 'unknown'}`,
    `  Provider / 模型: ${metadata ? `${metadata.provider} / ${metadata.model ?? 'unknown'}` : 'unknown'}`,
    `  数据质量: ${metadata?.dataQuality ?? 'unknown'}`,
  ];
  if (inputSummary) {
    lines.push(
      `  注册时间: ${formatNullable(inputSummary.userOverview.joinDate)}`,
      `  最后活跃时间: ${formatNullable(inputSummary.userOverview.lastActiveTime)}`,
      `  帖子数 / 回复数: ${formatNullable(inputSummary.userOverview.totalTopics)} / ${formatNullable(inputSummary.userOverview.totalReplies)}`,
      `  活跃期: ${inputSummary.activitySummary.totalPeriods}`,
    );
  } else {
    lines.push('  账号与活动事实: 该版本未保存输入摘要');
  }
  lines.push(
    '',
    result.summary,
    '',
    `${COLORS.bold}关键指标${COLORS.reset}`,
    `  职业方向: ${result.professional.career_path}`,
    `  技术水平: ${result.professional.level}`,
    `  人生阶段: ${result.personal.life_stage}`,
    `  风险评估: ${formatRiskLevel(result.risk.level)}`,
    `  风险理由: ${result.risk.reason}`,
    '',
  );
  return lines.join('\n');
}

/**
 * Renders reverse-ordered version summaries as a terminal table.
 * @param summaries - Verified result version summaries.
 * @returns Terminal-formatted history without performing I/O.
 */
export function renderResultHistory(summaries: ResultVersionSummary[]): string {
  const lines = [
    '',
    `${COLORS.bold}${COLORS.cyan}=== 结果版本历史 ===${COLORS.reset}`,
    '',
    HISTORY_COLUMNS.map(({ title, width }) => formatHistoryCell(title, width)).join(' '),
    HISTORY_COLUMNS.map(({ width }) => '-'.repeat(width)).join(' '),
  ];
  for (const summary of summaries) {
    lines.push(
      HISTORY_COLUMNS.map(({ width, value }) => formatHistoryCell(value(summary), width)).join(' '),
    );
  }
  return lines.join('\n');
}
