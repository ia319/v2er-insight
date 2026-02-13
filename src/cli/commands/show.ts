/**
 * show 命令 — 展示 AI 分析结果
 *
 * 读取 result.json，以结构化格式输出到终端。
 * 支持 --json 原始输出和 --brief 简略版。
 */

import type { AIAnalysisResult, PsychologicalProfile } from '@/core/ai';
import { readDataFile } from '@/infra/storage';
import { logger } from '@/infra/logger';
import { COLORS } from '@/infra/logger/colors';
import type { ShowCommandOptions } from '../types';

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

// -- 命令入口 ----------------------------------------------------------------

/**
 * 执行 show 命令
 */
export async function runShow(username: string, options: ShowCommandOptions): Promise<void> {
  const result = readDataFile<AIAnalysisResult>(username, 'result');

  if (!result) {
    logger.error(`未找到 ${username} 的分析结果`);
    logger.info('请先运行: v2er ai <username>');
    return;
  }

  // --json: 原始 JSON 输出
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // --brief: 简略版
  if (options.brief) {
    printBrief(result);
    return;
  }

  // 默认: 完整格式化
  printFull(result);
}
