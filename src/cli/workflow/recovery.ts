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
      description: '重新抓取用户资料并覆盖损坏缓存',
    },
  ],
  FETCH_PARTIAL_FAILED: [
    {
      type: 'instruction',
      content: '当前版本暂不支持仅重试失败页',
      description: '建议先执行全量重抓，后续阶段会接入 --retry 能力',
    },
    {
      type: 'command',
      content: 'v2er fetch <username> --force',
      description: '强制重新抓取，替换现有 raw 数据',
    },
  ],
  ANALYZE_INPUT_MISSING: [
    {
      type: 'command',
      content: 'v2er fetch <username>',
      description: '先生成 raw.json，再执行 analyze',
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
  SHOW_RESULT_MISSING: [
    {
      type: 'command',
      content: 'v2er ai <username>',
      description: '先生成 result.json，再执行展示',
    },
  ],
  UNKNOWN_ERROR: [],
};

/**
 * 获取指定原因码对应的恢复动作列表。
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
