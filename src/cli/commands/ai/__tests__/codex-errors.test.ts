import { describe, expect, it } from 'vitest';
import { AIResultParseError } from '@/core/ai';
import {
  CodexBootstrapRecoveryError,
  CodexProjectPathError,
  CodexRuntimeSelectionError,
  CodexThreadRegistryError,
  CodexThreadResumeError,
  CodexTurnResultError,
  type CodexRuntimeAttempt,
} from '@/core/ai/providers/codex';
import {
  CodexAppServerProtocolError,
  CodexAppServerRequestTimeoutError,
  type CodexExecutableCandidate,
} from '@/infra/codex';
import { CodexThreadRegistryCorruptError } from '@/infra/storage';
import { classifyCodexFailure, type CodexFailureReasonCode } from '../codex-errors';

const CANDIDATE: CodexExecutableCandidate = {
  path: 'C:\\App\\codex.exe',
  source: 'explicit',
  kind: 'native',
};

function runtimeError(attempt: Omit<CodexRuntimeAttempt, 'candidate'>): CodexRuntimeSelectionError {
  return new CodexRuntimeSelectionError([{ candidate: CANDIDATE, ...attempt }]);
}

const CASES: readonly {
  name: string;
  error: unknown;
  expected: CodexFailureReasonCode;
}[] = [
  {
    name: 'missing executable',
    error: new CodexRuntimeSelectionError([]),
    expected: 'AI_CODEX_EXECUTABLE_NOT_FOUND',
  },
  {
    name: 'incompatible executable',
    error: runtimeError({ code: 'version_failed', message: 'version failed' }),
    expected: 'AI_CODEX_EXECUTABLE_INCOMPATIBLE',
  },
  {
    name: 'missing account session',
    error: runtimeError({ code: 'account_unavailable', message: 'login required' }),
    expected: 'AI_CODEX_AUTH_REQUIRED',
  },
  {
    name: 'unavailable model',
    error: runtimeError({
      code: 'model_invalid',
      modelErrorCode: 'model_unavailable',
      message: 'model unavailable',
    }),
    expected: 'AI_CODEX_MODEL_NOT_FOUND',
  },
  {
    name: 'unsupported reasoning effort',
    error: runtimeError({
      code: 'model_invalid',
      modelErrorCode: 'effort_unsupported',
      message: 'effort unsupported',
    }),
    expected: 'AI_CODEX_REASONING_UNSUPPORTED',
  },
  {
    name: 'unavailable Project',
    error: new CodexProjectPathError('missing', 'Project missing'),
    expected: 'AI_CODEX_PROJECT_UNAVAILABLE',
  },
  {
    name: 'request timeout',
    error: new CodexAppServerRequestTimeoutError('thread/read', 1000),
    expected: 'AI_CODEX_TIMEOUT',
  },
  {
    name: 'invalid structured output',
    error: new AIResultParseError('invalid_json', 'invalid JSON'),
    expected: 'AI_CODEX_OUTPUT_INVALID',
  },
  {
    name: 'active turn',
    error: new CodexTurnResultError('turn_in_progress', 'turn-1', 'active'),
    expected: 'AI_CODEX_BUSY',
  },
  {
    name: 'failed turn',
    error: new CodexTurnResultError('turn_failed', 'turn-1', 'failed'),
    expected: 'AI_CODEX_TURN_FAILED',
  },
  {
    name: 'missing final turn message',
    error: new CodexTurnResultError('final_message_missing', 'turn-1', 'missing'),
    expected: 'AI_CODEX_OUTPUT_INVALID',
  },
  {
    name: 'missing persisted thread',
    error: new CodexBootstrapRecoveryError('thread_mismatch', 'thread mismatch'),
    expected: 'AI_CODEX_THREAD_NOT_FOUND',
  },
  {
    name: 'unknown persisted turn status',
    error: new CodexBootstrapRecoveryError('turn_not_found', 'turn missing'),
    expected: 'AI_CODEX_TURN_STATUS_UNKNOWN',
  },
  {
    name: 'thread system failure',
    error: new CodexBootstrapRecoveryError('thread_system_error', 'thread failed'),
    expected: 'AI_CODEX_TURN_FAILED',
  },
  {
    name: 'resume identity mismatch',
    error: new CodexThreadResumeError('model_mismatch', 'model mismatch'),
    expected: 'AI_CODEX_STATE_INVALID',
  },
  {
    name: 'registry transition failure',
    error: new CodexThreadRegistryError('invalid_transition', 'invalid transition'),
    expected: 'AI_CODEX_STATE_INVALID',
  },
  {
    name: 'corrupt registry',
    error: new CodexThreadRegistryCorruptError(),
    expected: 'AI_CODEX_STATE_INVALID',
  },
  {
    name: 'protocol failure',
    error: new CodexAppServerProtocolError('invalid response'),
    expected: 'AI_CODEX_PROTOCOL_ERROR',
  },
  {
    name: 'unknown provider failure',
    error: new Error('unknown'),
    expected: 'AI_PROVIDER_FAILED',
  },
];

describe('classifyCodexFailure', () => {
  it.each(CASES)('should classify $name', ({ error, expected }) => {
    expect(classifyCodexFailure(error)).toBe(expected);
  });
});
