import type { ReasonCode, RecoveryAction } from './types';

/**
 * 统一维护原因码到恢复动作的映射，避免恢复命令散落在各命令实现中。
 */
const RECOVERY_MAP: Record<ReasonCode, RecoveryAction[]> = {
  FETCH_PROFILE_FAILED: [
    {
      command: 'v2er fetch <username> --force',
      description: '重新抓取用户资料并覆盖损坏缓存',
    },
  ],
  FETCH_PARTIAL_FAILED: [
    {
      command: 'v2er fetch <username> --retry',
      description: '仅重试失败页面（该能力将在后续阶段接入）',
    },
    {
      command: 'v2er <username> --force',
      description: '强制执行全流程重跑',
    },
  ],
  ANALYZE_INPUT_MISSING: [
    {
      command: 'v2er fetch <username>',
      description: '先生成 raw.json，再执行 analyze',
    },
  ],
  AI_API_KEY_MISSING: [
    {
      command: 'v2er config proxy <url>',
      description: '如网络受限，先确保代理配置正确',
    },
    {
      command: '设置 GOOGLE_API_KEY 或 GEMINI_API_KEY',
      description: '配置 AI API Key 后重试',
    },
  ],
  AI_PROVIDER_FAILED: [
    {
      command: 'v2er ai <username>',
      description: '在已存在 analyzed.json 时直接重试 AI 步骤',
    },
  ],
  SHOW_RESULT_MISSING: [
    {
      command: 'v2er ai <username>',
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
