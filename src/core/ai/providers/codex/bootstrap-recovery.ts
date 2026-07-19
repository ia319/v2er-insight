import type { AIAnalysisResult } from '../../types';
import { parseAIAnalysisResult } from '../../result-parser';
import type { CodexAgentMessage, CodexThreadInfo, CodexTurnInfo } from '@/infra/codex';
import { areCodexProjectPathsEqual } from './project-path';
import type { CodexRegistryUpdate } from './registry-update';
import { completeCodexPromptTurn } from './thread-registry';
import type { CodexThreadRegistryV1, CodexThreadState } from './thread-state';
import { assertCodexTurnCompleted, selectCodexFinalMessage } from './turn-result';

export type CodexBootstrapRecoveryErrorCode =
  | 'thread_mismatch'
  | 'project_mismatch'
  | 'thread_system_error'
  | 'turn_not_found'
  | 'untracked_turns'
  | 'local_state_invalid'
  | 'transition_not_persisted';

/** Reports inconsistent persisted bootstrap state or an unusable thread. */
export class CodexBootstrapRecoveryError extends Error {
  readonly code: CodexBootstrapRecoveryErrorCode;

  constructor(code: CodexBootstrapRecoveryErrorCode, message: string) {
    super(message);
    this.name = 'CodexBootstrapRecoveryError';
    this.code = code;
  }
}

interface CodexBootstrapRecoveryBase {
  state: CodexThreadState;
  thread: CodexThreadInfo;
}

export type CodexBootstrapRecovery =
  | (CodexBootstrapRecoveryBase & { action: 'sendPrompt' | 'sendAnalysis' | 'ready' })
  | (CodexBootstrapRecoveryBase & { action: 'busy'; turnId: string | null })
  | (CodexBootstrapRecoveryBase & {
      action: 'analysisResult';
      turn: CodexTurnInfo;
      message: CodexAgentMessage;
      result: AIAnalysisResult;
    });

export interface RecoverCodexBootstrapOptions {
  state: CodexThreadState;
  thread: CodexThreadInfo;
  updateRegistry: CodexRegistryUpdate;
  now?: () => Date;
  platform?: NodeJS.Platform;
}

function recoveryError(code: CodexBootstrapRecoveryErrorCode, message: string): never {
  throw new CodexBootstrapRecoveryError(code, message);
}

function assertThreadIdentity(options: RecoverCodexBootstrapOptions): void {
  if (options.thread.id !== options.state.threadId) {
    recoveryError(
      'thread_mismatch',
      `Codex thread "${options.thread.id}" does not match session thread "${options.state.threadId}"`,
    );
  }
  if (
    !areCodexProjectPathsEqual(
      options.thread.cwd,
      options.state.projectPath,
      options.platform ?? process.platform,
    )
  ) {
    recoveryError(
      'project_mismatch',
      `Codex thread Project "${options.thread.cwd}" does not match session Project "${options.state.projectPath}"`,
    );
  }
  if (options.thread.status.type === 'systemError') {
    recoveryError('thread_system_error', `Codex thread "${options.thread.id}" has a system error`);
  }
}

function findTurn(thread: CodexThreadInfo, turnId: string): CodexTurnInfo {
  const turn = thread.turns.find((candidate) => candidate.id === turnId);
  if (!turn) {
    return recoveryError(
      'turn_not_found',
      `Codex turn "${turnId}" was not found in thread "${thread.id}"`,
    );
  }
  return turn;
}

function isBusy(thread: CodexThreadInfo): boolean {
  return thread.status.type === 'active';
}

function assertNoUntrackedTurns(thread: CodexThreadInfo, knownTurnIds: readonly string[]): void {
  const known = new Set(knownTurnIds);
  const untracked = thread.turns.find((turn) => !known.has(turn.id));
  if (untracked) {
    recoveryError(
      'untracked_turns',
      `Codex thread "${thread.id}" contains untracked turn "${untracked.id}"`,
    );
  }
}

function requirePersistedPromptCompletion(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  turnId: string,
): CodexThreadState {
  const state = registry.sessions.find((session) => session.localSessionId === localSessionId);
  if (
    state?.bootstrapStatus !== 'analysisPending' ||
    state.promptTurnId !== turnId ||
    state.lastTurnId !== turnId
  ) {
    return recoveryError(
      'transition_not_persisted',
      `Codex prompt turn "${turnId}" recovery was not persisted`,
    );
  }
  return state;
}

async function recoverPromptPending(
  options: RecoverCodexBootstrapOptions,
): Promise<CodexBootstrapRecovery> {
  const turnId = options.state.promptTurnId;
  if (turnId === null) {
    assertNoUntrackedTurns(options.thread, []);
    return isBusy(options.thread)
      ? { action: 'busy', state: options.state, thread: options.thread, turnId: null }
      : { action: 'sendPrompt', state: options.state, thread: options.thread };
  }

  assertNoUntrackedTurns(options.thread, [turnId]);
  const turn = findTurn(options.thread, turnId);
  if (turn.status === 'inProgress') {
    return { action: 'busy', state: options.state, thread: options.thread, turnId };
  }
  assertCodexTurnCompleted(turn);
  const usedAt = (options.now ?? (() => new Date()))().toISOString();
  const registry = await options.updateRegistry((current) =>
    completeCodexPromptTurn(current, options.state.localSessionId, turn.id, usedAt),
  );
  const state = requirePersistedPromptCompletion(registry, options.state.localSessionId, turn.id);
  return isBusy(options.thread)
    ? { action: 'busy', state, thread: options.thread, turnId: null }
    : { action: 'sendAnalysis', state, thread: options.thread };
}

function recoverAnalysisPending(options: RecoverCodexBootstrapOptions): CodexBootstrapRecovery {
  const promptTurnId = options.state.promptTurnId;
  if (promptTurnId === null) {
    return recoveryError(
      'local_state_invalid',
      `Codex analysis-pending session "${options.state.localSessionId}" has no prompt turn`,
    );
  }
  const promptTurn = findTurn(options.thread, promptTurnId);
  assertCodexTurnCompleted(promptTurn);

  const turnId = options.state.initialAnalysisTurnId;
  if (turnId === null) {
    assertNoUntrackedTurns(options.thread, [promptTurnId]);
    return isBusy(options.thread)
      ? { action: 'busy', state: options.state, thread: options.thread, turnId: null }
      : { action: 'sendAnalysis', state: options.state, thread: options.thread };
  }

  const turn = findTurn(options.thread, turnId);
  const promptIndex = options.thread.turns.findIndex((candidate) => candidate.id === promptTurnId);
  const analysisIndex = options.thread.turns.findIndex((candidate) => candidate.id === turnId);
  if (promptIndex < 0 || analysisIndex <= promptIndex) {
    return recoveryError(
      'local_state_invalid',
      `Codex analysis turn "${turnId}" does not follow prompt turn "${promptTurnId}"`,
    );
  }
  const untrackedBeforeAnalysis = options.thread.turns
    .slice(0, analysisIndex + 1)
    .find((candidate) => candidate.id !== promptTurnId && candidate.id !== turnId);
  if (untrackedBeforeAnalysis) {
    return recoveryError(
      'untracked_turns',
      `Codex bootstrap contains untracked turn "${untrackedBeforeAnalysis.id}"`,
    );
  }
  if (turn.status === 'inProgress') {
    return { action: 'busy', state: options.state, thread: options.thread, turnId };
  }
  assertCodexTurnCompleted(turn);
  const message = selectCodexFinalMessage(turn);
  return {
    action: 'analysisResult',
    state: options.state,
    thread: options.thread,
    turn,
    message,
    result: parseAIAnalysisResult(message.text),
  };
}

/**
 * Reconciles one local bootstrap state with a persisted App Server thread without resending.
 * @param options - Local state, thread snapshot, registry boundary, clock, and path platform.
 * @returns The next safe bootstrap action or recovered analysis result.
 * @throws {CodexBootstrapRecoveryError} When local and App Server state are inconsistent.
 */
export async function recoverCodexBootstrap(
  options: RecoverCodexBootstrapOptions,
): Promise<CodexBootstrapRecovery> {
  assertThreadIdentity(options);
  switch (options.state.bootstrapStatus) {
    case 'promptPending':
      return recoverPromptPending(options);
    case 'analysisPending':
      return recoverAnalysisPending(options);
    case 'ready':
      return isBusy(options.thread)
        ? {
            action: 'busy',
            state: options.state,
            thread: options.thread,
            turnId: null,
          }
        : { action: 'ready', state: options.state, thread: options.thread };
  }
}
