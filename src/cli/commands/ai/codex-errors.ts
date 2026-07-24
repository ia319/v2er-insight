import { AIResultParseError } from '@/core/ai';
import {
  CodexAnalysisSessionAdvanceError,
  CodexAnalysisTurnError,
  CodexBootstrapRecoveryError,
  CodexProjectPathError,
  CodexPromptTurnError,
  CodexRuntimeSelectionError,
  CodexThreadCreationError,
  CodexThreadRegistryError,
  CodexThreadResumeError,
  CodexTurnResultError,
} from '@/core/ai/providers/codex';
import {
  CodexAppServerProtocolError,
  CodexAppServerRequestTimeoutError,
  CodexAppServerRpcError,
  CodexAppServerTransportError,
  CodexTurnWaitTimeoutError,
} from '@/infra/codex';
import { CodexThreadRegistryCorruptError } from '@/infra/storage';
import type { ReasonCode } from '../../workflow/types';

export type CodexFailureReasonCode = Extract<
  ReasonCode,
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
  | 'AI_CODEX_BUSY'
  | 'AI_PROVIDER_FAILED'
>;

function classifyRuntimeSelection(error: CodexRuntimeSelectionError): CodexFailureReasonCode {
  if (error.attempts.length === 0) return 'AI_CODEX_EXECUTABLE_NOT_FOUND';
  if (error.attempts.some((attempt) => attempt.code === 'account_unavailable')) {
    return 'AI_CODEX_AUTH_REQUIRED';
  }

  const modelAttempts = error.attempts.filter((attempt) => attempt.code === 'model_invalid');
  if (modelAttempts.some((attempt) => attempt.modelErrorCode === 'effort_unsupported')) {
    return 'AI_CODEX_REASONING_UNSUPPORTED';
  }
  if (modelAttempts.some((attempt) => attempt.modelErrorCode === 'model_unavailable')) {
    return 'AI_CODEX_MODEL_NOT_FOUND';
  }
  if (modelAttempts.length > 0) return 'AI_CODEX_PROTOCOL_ERROR';
  if (error.attempts.every((attempt) => attempt.code === 'version_failed')) {
    return 'AI_CODEX_EXECUTABLE_INCOMPATIBLE';
  }
  return 'AI_CODEX_PROTOCOL_ERROR';
}

function isStateIntegrityError(error: unknown): boolean {
  return (
    error instanceof CodexAnalysisSessionAdvanceError ||
    error instanceof CodexAnalysisTurnError ||
    error instanceof CodexPromptTurnError ||
    error instanceof CodexThreadCreationError ||
    error instanceof CodexThreadRegistryError ||
    error instanceof CodexThreadRegistryCorruptError
  );
}

/**
 * Maps typed Codex provider failures to actionable CLI reason codes.
 * @param error - Failure raised by runtime discovery, App Server, session recovery, or output parsing.
 * @returns The narrowest reason code supported by concrete error evidence.
 */
export function classifyCodexFailure(error: unknown): CodexFailureReasonCode {
  if (error instanceof CodexRuntimeSelectionError) return classifyRuntimeSelection(error);
  if (error instanceof CodexProjectPathError) return 'AI_CODEX_PROJECT_UNAVAILABLE';
  if (
    error instanceof CodexAppServerRequestTimeoutError ||
    error instanceof CodexTurnWaitTimeoutError
  ) {
    return 'AI_CODEX_TIMEOUT';
  }
  if (error instanceof AIResultParseError) return 'AI_CODEX_OUTPUT_INVALID';

  if (error instanceof CodexTurnResultError) {
    if (error.code === 'turn_in_progress') return 'AI_CODEX_BUSY';
    if (error.code === 'final_message_missing') return 'AI_CODEX_OUTPUT_INVALID';
    return 'AI_CODEX_TURN_FAILED';
  }

  if (error instanceof CodexBootstrapRecoveryError) {
    if (error.code === 'thread_mismatch') return 'AI_CODEX_THREAD_NOT_FOUND';
    if (error.code === 'turn_not_found' || error.code === 'untracked_turns') {
      return 'AI_CODEX_TURN_STATUS_UNKNOWN';
    }
    if (error.code === 'thread_system_error') return 'AI_CODEX_TURN_FAILED';
    return 'AI_CODEX_STATE_INVALID';
  }

  if (error instanceof CodexThreadResumeError) {
    return error.code === 'thread_mismatch'
      ? 'AI_CODEX_THREAD_NOT_FOUND'
      : 'AI_CODEX_STATE_INVALID';
  }
  if (isStateIntegrityError(error)) return 'AI_CODEX_STATE_INVALID';
  if (
    error instanceof CodexAppServerProtocolError ||
    error instanceof CodexAppServerTransportError ||
    error instanceof CodexAppServerRpcError
  ) {
    return 'AI_CODEX_PROTOCOL_ERROR';
  }
  return 'AI_PROVIDER_FAILED';
}
