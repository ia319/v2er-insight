import type { ReasonCode, RecoveryAction } from './types';

interface RecoveryRenderContext {
  username?: string;
}

/**
 * 统一维护原因码到恢复动作的映射，避免恢复命令散落在各命令实现中。
 */
const RECOVERY_MAP: Record<ReasonCode, RecoveryAction[]> = {
  FETCH_PROFILE_FAILED: [
    {
      type: 'command',
      content: 'v2er fetch <username> --force',
      description: '重新抓取 <username> 的用户资料并覆盖损坏缓存',
    },
  ],
  FETCH_PARTIAL_FAILED: [
    {
      type: 'instruction',
      content: '当前版本暂不支持局部修复不完整抓取',
      description: '建议执行全量重抓以恢复完整快照',
    },
    {
      type: 'command',
      content: 'v2er fetch <username> --force',
      description: '强制重新抓取，替换不完整的 raw 数据',
    },
  ],
  PROVENANCE_STATE_INVALID: [
    {
      type: 'instruction',
      content: '先备份并移出损坏的 analysis-state.json，保留原文件用于诊断',
      description: '状态文件验证失败；现有 provenance 保持原状',
    },
    {
      type: 'command',
      content: 'v2er fetch <username> --force',
      description: '移出损坏状态文件后，全量重建 raw 数据与 provenance',
    },
  ],
  PROVENANCE_UPDATE_FAILED: [
    {
      type: 'instruction',
      content: '检查数据目录权限和可用磁盘空间后重试',
      description: '数据文件与 provenance 状态的一致性提交未完成',
    },
    {
      type: 'command',
      content: 'v2er fetch <username> --force',
      description: '重新生成一致的 raw 数据与 provenance 状态',
    },
  ],
  ANALYZE_INPUT_MISSING: [
    {
      type: 'command',
      content: 'v2er fetch <username>',
      description: '先生成 raw.json，再执行 analyze',
    },
  ],
  ANALYZE_PROVENANCE_MISSING: [
    {
      type: 'command',
      content: 'v2er fetch <username> --force',
      description: '重新抓取并建立 raw.json 对应的 provenance 状态',
    },
  ],
  ANALYZE_SOURCE_MISMATCH: [
    {
      type: 'command',
      content: 'v2er fetch <username> --force',
      description: '重新生成相互匹配的 raw 数据与 provenance 状态',
    },
  ],
  ANALYZE_FAILED: [
    {
      type: 'command',
      content: 'v2er analyze <username>',
      description: '修复数据问题后重试 analyze 步骤',
    },
    {
      type: 'command',
      content: 'v2er fetch <username> --force',
      description: '若 raw 数据可能损坏，先强制重新抓取再分析',
    },
  ],
  AI_INPUT_MISSING: [
    {
      type: 'command',
      content: 'v2er analyze <username>',
      description: '先生成 analyzed.json，再执行 AI 分析',
    },
  ],
  AI_INPUT_INVALID: [
    {
      type: 'command',
      content: 'v2er <username> --force',
      description: '重新抓取并生成受支持的 AnalyzerOutput V2',
    },
  ],
  AI_PROVENANCE_MISSING: [
    {
      type: 'command',
      content: 'v2er <username> --force',
      description: '重新抓取、分析并建立完整 provenance 状态',
    },
  ],
  AI_SOURCE_MISMATCH: [
    {
      type: 'command',
      content: 'v2er analyze <username>',
      description: '根据当前 raw 数据和 Analyzer 配置重新生成 analyzed 数据',
    },
    {
      type: 'command',
      content: 'v2er <username> --force',
      description: '若 raw provenance 也不一致，执行全量重抓和分析',
    },
  ],
  AI_API_KEY_MISSING: [
    {
      type: 'instruction',
      content: '先在环境变量或配置文件中设置 API Key',
      description: '当前缺少 AI API Key，无法发起 AI 请求',
    },
    {
      type: 'command',
      content: 'v2er ai <username>',
      description: '完成 API Key 配置后重试 AI 步骤',
    },
  ],
  AI_INVALID_THINKING_LEVEL: [
    {
      type: 'instruction',
      content: '将 thinking-level 调整为 minimal | low | medium | high 之一',
      description: '当前传入的思考等级不合法，需使用受支持的枚举值',
    },
    {
      type: 'command',
      content: 'v2er ai <username> --thinking-level medium',
      description: '使用合法思考等级重试 AI 步骤',
    },
    {
      type: 'command',
      content: 'v2er config set ai.thinkingLevel medium',
      description: '修正全局默认 thinkingLevel，避免后续重复报错',
    },
  ],
  AI_INVALID_PROVIDER_OPTIONS: [],
  AI_CODEX_BUSY: [
    {
      type: 'instruction',
      content: '检查当前 v2er 进程和 ChatGPT App 任务状态，等待活动分析结束后重试',
      description: '同一用户已有本地分析进程或 Codex 任务占用执行位置',
    },
    {
      type: 'command',
      content: 'v2er ai <username> --provider codex',
      description: '活动回合结束后恢复已记录状态',
    },
  ],
  AI_CODEX_LOCK_FAILED: [
    {
      type: 'instruction',
      content: '检查用户数据目录权限和当前 v2er 进程状态',
      description: 'Codex 执行锁未能安全取得或释放',
    },
    {
      type: 'command',
      content: 'v2er ai <username> --provider codex',
      description: '确认目录可写且没有活动分析进程后重试',
    },
  ],
  AI_CODEX_SESSION_UPDATE_FAILED: [
    {
      type: 'instruction',
      content: '保留 result.json、analysis-state.json 和 codex-sessions.json 用于恢复',
      description: '结果与 provenance 已保存，Codex session 完成状态仍待更新',
    },
    {
      type: 'command',
      content: 'v2er ai <username> --provider codex',
      description: '重新读取已完成回合并补全 session 状态',
    },
  ],
  AI_PROVIDER_FAILED: [
    {
      type: 'instruction',
      content: '常见原因：网络或代理异常、请求限流(429)、模型不可用、响应格式异常',
      description: '请先结合错误信息定位原因，再执行对应恢复动作',
    },
    {
      type: 'command',
      content: 'v2er config proxy <url>',
      description: '网络受限时先配置代理后再重试',
    },
    {
      type: 'command',
      content: 'v2er ai <username>',
      description: '在已存在 analyzed.json 时直接重试 AI 步骤',
    },
    {
      type: 'command',
      content: 'v2er ai <username> --model gemini-2.0-flash',
      description: '若当前模型不稳定，可切换模型后重试',
    },
  ],
  AI_RESULT_WRITE_FAILED: [
    {
      type: 'instruction',
      content: '检查数据目录权限和可用磁盘空间后重试',
      description: 'AI 已返回结果，但 result.json 未成功写入且发送状态未推进',
    },
    {
      type: 'command',
      content: 'v2er ai <username>',
      description: '存储问题修复后重新发送并保存结果',
    },
  ],
  SHOW_RESULT_MISSING: [
    {
      type: 'command',
      content: 'v2er ai <username>',
      description: '先生成 result.json，再执行展示',
    },
  ],
  SHOW_RESULT_INVALID: [
    {
      type: 'command',
      content: 'v2er ai <username>',
      description: '重新生成结构完整的 result.json',
    },
  ],
  UNKNOWN_ERROR: [],
};

/**
 * 渲染恢复动作中的模板变量（如 <username>）。
 */
function renderTemplate(content: string, context: RecoveryRenderContext): string {
  if (!context.username) return content;
  return content.replace(/<username>/g, context.username);
}

/**
 * 获取指定原因码对应的恢复动作列表，并按上下文渲染模板变量。
 */
export function getRecoveryActions(
  reasonCode?: ReasonCode,
  context: RecoveryRenderContext = {},
): RecoveryAction[] {
  if (!reasonCode) return [];

  const actions = RECOVERY_MAP[reasonCode] ?? [];
  return actions.map((action) => ({
    ...action,
    content: renderTemplate(action.content, context),
    description: renderTemplate(action.description, context),
  }));
}
