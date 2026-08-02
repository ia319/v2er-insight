import type { ThinkingLevel } from '@/config';

/**
 * Workflow 层共享类型定义
 */

/** 全流程固定步骤名称 */
export type WorkflowStep = 'fetch' | 'analyze' | 'ai' | 'show';

/** 单步骤执行状态 */
export type StepStatus = 'success' | 'partial' | 'failed' | 'skipped';

/** 统一错误/诊断原因码 */
export type ReasonCode =
  | 'FETCH_PROFILE_FAILED'
  | 'FETCH_PARTIAL_FAILED'
  | 'PROVENANCE_STATE_INVALID'
  | 'PROVENANCE_UPDATE_FAILED'
  | 'ANALYZE_INPUT_MISSING'
  | 'ANALYZE_PROVENANCE_MISSING'
  | 'ANALYZE_SOURCE_MISMATCH'
  | 'ANALYZE_FAILED'
  | 'AI_INPUT_MISSING'
  | 'AI_INPUT_INVALID'
  | 'AI_PROVENANCE_MISSING'
  | 'AI_SOURCE_MISMATCH'
  | 'AI_API_KEY_MISSING'
  | 'AI_INVALID_THINKING_LEVEL'
  | 'AI_INVALID_PROVIDER_OPTIONS'
  | 'AI_CODEX_BUSY'
  | 'AI_CODEX_LOCK_FAILED'
  | 'AI_CODEX_SESSION_UPDATE_FAILED'
  | 'AI_CODEX_EXECUTABLE_NOT_FOUND'
  | 'AI_CODEX_EXECUTABLE_INCOMPATIBLE'
  | 'AI_CODEX_AUTH_REQUIRED'
  | 'AI_CODEX_PROTOCOL_ERROR'
  | 'AI_CODEX_MODEL_NOT_FOUND'
  | 'AI_CODEX_REASONING_UNSUPPORTED'
  | 'AI_CODEX_PROJECT_UNAVAILABLE'
  | 'AI_CODEX_THREAD_NOT_FOUND'
  | 'AI_CODEX_TURN_FAILED'
  | 'AI_CODEX_TURN_STATUS_UNKNOWN'
  | 'AI_CODEX_OUTPUT_INVALID'
  | 'AI_CODEX_TIMEOUT'
  | 'AI_CODEX_STATE_INVALID'
  | 'SESSION_BUSY'
  | 'SESSION_PERSIST_FAILED'
  | 'SESSION_MIGRATION_CONFLICT'
  | 'SESSION_MIGRATION_FAILED'
  | 'AI_PROVIDER_FAILED'
  | 'AI_RESULT_WRITE_FAILED'
  | 'SHOW_RESULT_MISSING'
  | 'SHOW_RESULT_INVALID'
  | 'UNKNOWN_ERROR';

/** 步骤失败或部分成功时可提供给用户的恢复动作 */
export interface RecoveryAction {
  /** 动作类型：可执行命令或人工操作指引 */
  type: 'command' | 'instruction';
  /** 动作内容：命令文本或操作说明 */
  content: string;
  /** 动作用途说明 */
  description: string;
}

export type NoticeCode =
  | 'DATA_RETENTION_ENABLED'
  | 'DATA_FILES_CLEANED'
  | 'DATA_RESULT_STALE'
  | 'DATA_SNAPSHOT_PARTIAL';
export type NoticeSeverity = 'info' | 'warning';

/** A machine-identifiable, non-fatal user-facing effect. */
export interface UserNotice {
  code: NoticeCode;
  severity: NoticeSeverity;
  summary: string;
  details?: string[];
  actions?: RecoveryAction[];
  documentation?: string;
}

/** 单个步骤的结构化执行结果 */
export interface StepRunResult {
  /** 当前结果对应的步骤 */
  step: WorkflowStep;
  /** 步骤最终状态 */
  status: StepStatus;
  /** 非 success 状态下的原因码 */
  reasonCode?: ReasonCode;
  /** 面向用户的简短提示 */
  message?: string;
  /** 是否可通过恢复动作继续处理 */
  recoverable?: boolean;
  /** 恢复动作列表（按建议顺序） */
  recoverActions?: RecoveryAction[];
  /** 额外元数据，用于编排判断或后续重试 */
  meta?: Record<string, unknown>;
  /** Structured user impact for a continuing workflow step. */
  notices?: UserNotice[];
}

/** 本地中间产物状态 */
export interface WorkflowState {
  hasRaw: boolean;
  hasAnalyzed: boolean;
  hasResult: boolean;
}

/** 工作流最终聚合状态 */
export type WorkflowOverallStatus = 'success' | 'partial' | 'failed';

/** 一键工作流入口参数 */
export interface RunWorkflowOptions {
  username: string;
  force?: boolean;
  provider?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  reasoningEffort?: string;
  newThread?: boolean;
  codexProject?: string;
  resend?: boolean;
  verbose?: boolean;
}

/** 一键工作流执行结果 */
export interface RunOutcome {
  overallStatus: WorkflowOverallStatus;
  exitCode: 0 | 1;
  failedStep?: WorkflowStep;
  results: StepRunResult[];
}
