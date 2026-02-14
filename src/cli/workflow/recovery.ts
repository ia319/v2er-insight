import type { ReasonCode, RecoveryAction } from './types';

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
      type: 'command',
      content: 'v2er fetch <username> --retry',
      description: '仅重试失败页面（该能力将在后续阶段接入）',
    },
    {
      type: 'command',
      content: 'v2er <username> --force',
      description: '强制执行全流程重跑',
    },
  ],
  ANALYZE_INPUT_MISSING: [
    {
      type: 'command',
      content: 'v2er fetch <username>',
      description: '先生成 raw.json，再执行 analyze',
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
      type: 'command',
      content: 'v2er ai <username>',
      description: '在已存在 analyzed.json 时直接重试 AI 步骤',
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
export function getRecoveryActions(reasonCode?: ReasonCode): RecoveryAction[] {
  if (!reasonCode) return [];
  return RECOVERY_MAP[reasonCode] ?? [];
}
