import {
  AI_PROVIDERS,
  DEFAULT_CONFIG,
  getConfig,
  resolveCodexConfig,
  resolveGeminiConfig,
  type AIProviderId,
} from '@/config';
import { resolveApiKey } from '@/core/ai';
import { logger } from '@/infra/logger';
import { checkCodexSession } from './session/codex-check';
import type { CodexSessionCheckReport } from './session/codex-types';

export interface SessionCheckOptions {
  provider?: string;
}

export interface SessionCheckResult {
  status: 'success' | 'failed';
  provider: AIProviderId | null;
}

function isProvider(value: string): value is AIProviderId {
  return AI_PROVIDERS.some((provider) => provider === value);
}

function renderCandidates(report: CodexSessionCheckReport): void {
  logger.section('Codex CLI');
  logger.detail(`ChatGPT/Codex App: ${report.appDetected ? '已发现' : '未发现'}`);
  if (report.candidates.length === 0) {
    logger.warn('未发现 Codex CLI');
    return;
  }
  for (const entry of report.candidates) {
    const version =
      entry.version.status === 'available'
        ? entry.version.version
        : entry.version.status === 'unavailable'
          ? '版本探测失败'
          : '未探测版本';
    const trust =
      entry.trust.status === 'trusted'
        ? entry.trust.basis === 'explicit'
          ? '显式授权'
          : `签名可信: ${entry.trust.publisher}`
        : entry.trust.status === 'manual_only'
          ? '需要显式配置'
          : `已拒绝: ${entry.trust.reason}`;
    const selection =
      entry.selection === 'selected'
        ? '已选择'
        : entry.selection === 'rejected'
          ? `不可用: ${entry.modelErrorCode ?? entry.attemptCode ?? 'unknown'}`
          : '未进入协议检查';
    logger.detail(
      `${entry.candidate.path} [${entry.candidate.source}, ${entry.candidate.kind}] ${trust}; ${version}; ${selection}`,
    );
  }
}

function renderProject(report: CodexSessionCheckReport): void {
  logger.section('Project');
  const project = report.project;
  if (project.path) logger.detail(`路径: ${project.path}`);
  if (project.source) logger.detail(`来源: ${project.source}`);
  logger.detail(`状态: ${project.status === 'available' ? '可用' : project.code}`);
  if (project.path) {
    logger.detail('App 项目树: 建议将该路径添加为本地 Project，以便查看关联任务');
  }
}

function renderRuntime(report: CodexSessionCheckReport): void {
  logger.section('Runtime');
  const runtime = report.runtime;
  if (!runtime) {
    logger.warn('没有可用的 Codex App Server runtime');
    return;
  }
  logger.detail(`CLI: ${runtime.executablePath}`);
  logger.detail(`版本: ${runtime.version}`);
  logger.detail(`App Server: ${runtime.userAgent}`);
  logger.detail(`Codex home: ${runtime.codexHome}`);
  logger.detail(`账户状态: 可用; 类型: ${runtime.accountType ?? '未提供'}`);
  logger.detail(`配置请求: ${runtime.requestedModel} / ${runtime.requestedReasoningEffort}`);
  logger.detail(
    `${runtime.modelSelection === 'configured' ? '当前选择' : '诊断回退'}: ${runtime.selectedModel} / ${runtime.selectedReasoningEffort}`,
  );
  logger.detail('可用模型:');
  for (const model of runtime.models) {
    logger.detail(
      `- ${model.model}${model.isDefault ? ' [默认]' : ''}; 默认 effort=${model.defaultReasoningEffort}; 可选=${model.supportedReasoningEfforts.join(' | ')}`,
    );
  }
}

function renderLocalState(report: CodexSessionCheckReport): void {
  logger.section('本地 Session');
  if (report.registry.status === 'not_requested') {
    logger.detail('用户: 未指定');
  } else if (report.registry.status === 'valid') {
    logger.detail(`活动 session: ${report.registry.activeSessionId ?? '无'}`);
    for (const session of report.registry.sessions) {
      logger.detail(
        `- ${session.displayName}; generation=${session.generation}; stage=${session.bootstrapStatus}; thread=${session.threadId}; model=${session.model}${session.hasPendingAnalysis ? '; pending analysis' : ''}`,
      );
    }
  } else {
    logger.detail(`Registry: ${report.registry.status}`);
  }

  if (report.lock.status === 'locked') {
    logger.detail(`执行锁: PID ${report.lock.pid}; ${report.lock.acquiredAt}`);
  } else if (report.lock.status !== 'not_requested') {
    logger.detail(`执行锁: ${report.lock.status}`);
  }

  if (report.thread) {
    const status =
      report.thread.status.type === 'active'
        ? `active (${report.thread.status.activeFlags.join(' | ') || 'generating'})`
        : report.thread.status.type;
    logger.detail(
      `Thread: ${report.thread.threadId}; ${status}; last=${report.thread.lastTurnId ?? '无'} / ${report.thread.lastTurnStatus ?? '无'}`,
    );
    logger.detail(`Thread cwd: ${report.thread.cwd}`);
  }
}

function renderIssues(report: CodexSessionCheckReport): void {
  if (report.issues.length === 0) {
    logger.success('Session 检查通过');
    return;
  }
  logger.section('诊断');
  for (const issue of report.issues) {
    const message = `[${issue.code}] ${issue.message}`;
    if (issue.severity === 'error') logger.error(message);
    else logger.warn(message);
  }
}

/**
 * Runs a read-only provider session check and renders its structured result.
 * @param username - Optional V2EX user for Codex registry and thread inspection.
 * @param options - Optional provider override.
 * @returns Success when the selected provider has no diagnostic errors.
 */
export async function runSessionCheck(
  username: string | undefined,
  options: SessionCheckOptions,
): Promise<SessionCheckResult> {
  const config = getConfig();
  const providerValue = options.provider ?? config.ai?.provider ?? DEFAULT_CONFIG.ai.provider;
  if (!isProvider(providerValue)) {
    logger.error(`无效的 AI provider: ${providerValue}`);
    return { status: 'failed', provider: null };
  }

  if (providerValue === 'gemini') {
    const gemini = resolveGeminiConfig(config.ai);
    const hasApiKey = resolveApiKey() !== null;
    logger.section('Gemini Session');
    logger.detail(`模型: ${gemini.model}`);
    logger.detail(`思考等级: ${gemini.thinkingLevel}`);
    logger.detail(`API Key: ${hasApiKey ? '已配置' : '未配置'}`);
    if (!hasApiKey) logger.warn('Gemini API Key 未配置');
    else logger.success('Session 检查通过');
    return { status: hasApiKey ? 'success' : 'failed', provider: 'gemini' };
  }

  try {
    const report = await checkCodexSession(username, resolveCodexConfig(config.ai), {
      ...(config.proxy ? { proxyUrl: config.proxy } : {}),
    });
    renderCandidates(report);
    renderProject(report);
    renderRuntime(report);
    renderLocalState(report);
    renderIssues(report);
    return {
      status: report.issues.some((issue) => issue.severity === 'error') ? 'failed' : 'success',
      provider: 'codex',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Codex session 检查失败: ${message}`);
    return { status: 'failed', provider: 'codex' };
  }
}
