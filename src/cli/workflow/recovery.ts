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
  AI_INVALID_PROVIDER_OPTIONS: [
    {
      type: 'instruction',
      content: '将 --provider 或 ai.provider 设置为 gemini | codex，并使用对应的专属选项',
      description:
        'Gemini 使用 --thinking-level；Codex 使用 --reasoning-effort 和 --codex-project；两个 provider 均支持 --new-thread',
    },
  ],
  AI_CODEX_EXECUTABLE_NOT_FOUND: [
    {
      type: 'instruction',
      content: '启动 ChatGPT/Codex App，或配置 ai.codex.executable 指向可用 CLI',
      description: '当前环境没有可探测的 Codex CLI',
    },
    {
      type: 'command',
      content: 'v2er session check <username> --provider codex',
      description: '重新检查 CLI 发现结果',
    },
  ],
  AI_CODEX_EXECUTABLE_INCOMPATIBLE: [
    {
      type: 'instruction',
      content: '更新 ChatGPT/Codex App，或配置兼容的 Codex CLI',
      description: '已发现的 CLI 无法完成版本探测',
    },
    {
      type: 'command',
      content: 'v2er session check <username> --provider codex',
      description: '查看全部候选的版本和拒绝原因',
    },
  ],
  AI_CODEX_AUTH_REQUIRED: [
    {
      type: 'instruction',
      content: '在 ChatGPT/Codex App 中完成登录后重试',
      description: '独立 App Server 当前没有可用账户会话',
    },
    {
      type: 'command',
      content: 'v2er session check <username> --provider codex',
      description: '确认账户状态和实时模型目录',
    },
  ],
  AI_CODEX_PROTOCOL_ERROR: [
    {
      type: 'command',
      content: 'v2er session check <username> --provider codex',
      description: '检查 App Server 初始化、候选 CLI 和协议能力',
    },
    {
      type: 'instruction',
      content: '根据诊断结果更新 App 或选择兼容 CLI',
      description: '当前 App Server 响应或连接不符合所需协议',
    },
  ],
  AI_CODEX_MODEL_NOT_FOUND: [
    {
      type: 'command',
      content: 'v2er session check <username> --provider codex',
      description: '查看账户当前可见的实时模型目录',
    },
    {
      type: 'command',
      content: 'v2er config set ai.codex.model <model>',
      description: '选择诊断输出中的可用模型',
    },
  ],
  AI_CODEX_REASONING_UNSUPPORTED: [
    {
      type: 'command',
      content: 'v2er session check <username> --provider codex',
      description: '查看所选模型支持的 reasoning effort',
    },
    {
      type: 'command',
      content: 'v2er config set ai.codex.reasoningEffort <effort>',
      description: '选择诊断输出中的可用思考深度',
    },
  ],
  AI_CODEX_PROJECT_UNAVAILABLE: [
    {
      type: 'instruction',
      content: '创建或修正 Codex Project 目录，并确认当前用户具有读取权限',
      description: '解析后的 Project 路径缺失、不是目录或不可访问',
    },
    {
      type: 'command',
      content: 'v2er session check <username> --provider codex',
      description: '查看 Project 绝对路径、来源和目录状态',
    },
  ],
  AI_CODEX_THREAD_NOT_FOUND: [
    {
      type: 'instruction',
      content: '确认 App 中原任务仍存在；任务已删除时创建新 generation',
      description: '本地 registry 中的 thread 无法按原 ID恢复',
    },
    {
      type: 'command',
      content: 'v2er ai <username> --provider codex --new-thread',
      description: '保留旧记录并创建新的 Codex 任务',
    },
  ],
  AI_CODEX_TURN_FAILED: [
    {
      type: 'instruction',
      content: '在 App 中查看失败或中断回合的状态和错误',
      description: '记录的 Codex 回合以失败、终止或系统错误结束',
    },
    {
      type: 'command',
      content: 'v2er ai <username> --provider codex --new-thread',
      description: '需要重新分析时创建独立的新 generation',
    },
  ],
  AI_CODEX_TURN_STATUS_UNKNOWN: [
    {
      type: 'instruction',
      content: '在 App 中核对 thread 和最近回合，确认原分析是否已被接受',
      description: '本地 turn ID与持久 thread 历史无法可靠关联',
    },
    {
      type: 'command',
      content: 'v2er session check <username> --provider codex',
      description: '读取 registry、thread 和最后回合状态',
    },
  ],
  AI_CODEX_OUTPUT_INVALID: [
    {
      type: 'instruction',
      content: '在 App 中查看分析回合的最终回复和完成状态',
      description: '最终回复缺失或不符合完整画像结果契约',
    },
    {
      type: 'command',
      content: 'v2er ai <username> --provider codex --new-thread',
      description: '创建新 generation 重新执行提示轮和分析轮',
    },
  ],
  AI_CODEX_TIMEOUT: [
    {
      type: 'instruction',
      content: '先在 App 中检查原回合状态，再决定恢复或创建新 generation',
      description: '请求或回合等待超过配置期限，原回合可能仍已被接受',
    },
    {
      type: 'command',
      content: 'v2er session check <username> --provider codex',
      description: '核对 thread 和最近 turn 的持久状态',
    },
  ],
  AI_CODEX_STATE_INVALID: [
    {
      type: 'instruction',
      content: '保留 sessions/ 和 codex-sessions.json，并检查本地 session 与外部 thread 的身份差异',
      description: '本地 session 转移或恢复身份校验失败',
    },
    {
      type: 'command',
      content: 'v2er session check <username> --provider codex',
      description: '读取锁、registry、Project 和 thread 诊断',
    },
  ],
  SESSION_MIGRATION_CONFLICT: [
    {
      type: 'instruction',
      content: '保留 sessions/ 和 codex-sessions.json，不要手动合并或覆盖会话文件',
      description: '新旧会话存储缺少一致的迁移标记或存在身份冲突',
    },
    {
      type: 'command',
      content: 'v2er session check <username> --provider codex',
      description: '只读检查新旧会话存储状态',
    },
  ],
  SESSION_MIGRATION_FAILED: [
    {
      type: 'instruction',
      content: '保留 sessions/ 和 codex-sessions.json，并检查用户数据目录的可写权限与剩余空间',
      description: '旧 Codex 会话未能完整写入新会话存储',
    },
    {
      type: 'command',
      content: 'v2er ai <username> --provider codex',
      description: '修复存储条件后继续幂等迁移',
    },
  ],
  SESSION_BUSY: [
    {
      type: 'instruction',
      content: '等待同一用户的活动 AI 分析结束后重试',
      description: '同一用户的持久会话正在更新',
    },
  ],
  SESSION_PERSIST_FAILED: [
    {
      type: 'instruction',
      content: '保留 sessions/、results/ 和 analysis-state.json，并检查用户数据目录权限与剩余空间',
      description: '结果版本可能已经保存，会话状态仍需恢复',
    },
    {
      type: 'command',
      content: 'v2er ai <username>',
      description: '重新读取 pending 结果并补全会话状态',
    },
  ],
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
      content: '保留 result.json、analysis-state.json 和 sessions/ 用于恢复',
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
  CHAT_SESSION_MISSING: [
    {
      type: 'command',
      content: 'v2er ai <username>',
      description: '先完成一次 AI 分析，再使用默认聊天会话',
    },
    {
      type: 'command',
      content: 'v2er ai <username> --provider codex',
      description: '需要 Codex 会话时，先显式完成一次 Codex 分析',
    },
  ],
  CHAT_SESSION_INVALID: [
    {
      type: 'command',
      content: 'v2er session check <username>',
      description: '只读检查活动会话、迁移状态和 provider 关联',
    },
  ],
  CHAT_CONTEXT_TOO_LONG: [
    {
      type: 'command',
      content: 'v2er ai <username> --new-thread',
      description: '准备好当前 analyzed 数据后，显式创建新的会话 generation',
    },
  ],
  CHAT_PROVIDER_FAILED: [
    {
      type: 'command',
      content: 'v2er session check <username>',
      description: '检查 provider 运行条件和活动会话，不发送测试消息',
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
