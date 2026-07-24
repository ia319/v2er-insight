import { randomUUID } from 'node:crypto';
import type { CodexAgentMessage, CodexThreadInfo, CodexTurnInfo } from '@/infra/codex';
import type { AIAnalysisResult } from '../../types';
import {
  isCodexAnalysisResultApplicable,
  planCodexAnalysisDelivery,
  type CodexAnalysisDeliveryTarget,
} from './analysis-delivery';
import {
  activateCodexInitialAnalysisTurn,
  completeCodexAnalysisUpdateTurn,
  sendCodexAnalysisUpdateTurn,
  sendCodexInitialAnalysisTurn,
} from './analysis-turn';
import type { CodexRegistryUpdate } from './registry-update';
import type { PreparedCodexAnalysisSession } from './session-preparation';
import { sendCodexPromptTurn } from './prompt-turn';
import type { CodexRuntimeConnection } from './runtime-selection';
import { cancelPreparedCodexAnalysisDelivery } from './thread-registry';
import type {
  CodexPendingAnalysisDelivery,
  CodexThreadRegistryV1,
  CodexThreadState,
  PrepareCodexAnalysisDeliveryInput,
} from './thread-state';

export type CodexAnalysisCompletionKind = 'initial' | 'update';

export type CodexAnalysisSessionAdvanceErrorCode =
  | 'invalid_stage'
  | 'recovery_required'
  | 'state_not_persisted';

/** Reports an inconsistent prepared action or missing persisted session transition. */
export class CodexAnalysisSessionAdvanceError extends Error {
  readonly code: CodexAnalysisSessionAdvanceErrorCode;

  constructor(code: CodexAnalysisSessionAdvanceErrorCode, message: string) {
    super(message);
    this.name = 'CodexAnalysisSessionAdvanceError';
    this.code = code;
  }
}

export interface AdvanceCodexAnalysisSessionOptions {
  prepared: PreparedCodexAnalysisSession;
  target: CodexAnalysisDeliveryTarget;
  systemPrompt: string;
  payload: string;
  timeoutMs: number;
  connection: Pick<CodexRuntimeConnection, 'runTurn'>;
  updateRegistry: CodexRegistryUpdate;
  createDeliveryId?: () => string;
  now?: () => Date;
}

interface CodexAnalysisAdvanceBase {
  registry: CodexThreadRegistryV1;
  state: CodexThreadState;
  thread: CodexThreadInfo;
}

export type CodexAnalysisSessionAdvance =
  | (CodexAnalysisAdvanceBase & {
      action: 'busy';
      turnId: string | null;
    })
  | (CodexAnalysisAdvanceBase & {
      action: 'continue';
      reason: 'prompt_completed' | 'superseded_result';
    })
  | (CodexAnalysisAdvanceBase & {
      action: 'result';
      source: 'recovered' | 'sent';
      completion: CodexAnalysisCompletionKind;
      delivery: CodexPendingAnalysisDelivery | PrepareCodexAnalysisDeliveryInput;
      turn: CodexTurnInfo;
      message: CodexAgentMessage;
      result: AIAnalysisResult;
    });

function getSession(registry: CodexThreadRegistryV1, localSessionId: string): CodexThreadState {
  const state = registry.sessions.find((session) => session.localSessionId === localSessionId);
  if (!state) {
    throw new CodexAnalysisSessionAdvanceError(
      'state_not_persisted',
      `Codex local session "${localSessionId}" was not found after persistence`,
    );
  }
  return state;
}

function getCompletionKind(state: CodexThreadState): CodexAnalysisCompletionKind {
  switch (state.bootstrapStatus) {
    case 'analysisPending':
      return 'initial';
    case 'ready':
      return 'update';
    case 'promptPending':
      throw new CodexAnalysisSessionAdvanceError(
        'invalid_stage',
        `Codex session "${state.localSessionId}" is not ready for analysis`,
      );
  }
}

function rejectUnsupportedPreparedAction(action: never): never {
  throw new CodexAnalysisSessionAdvanceError(
    'invalid_stage',
    `Unsupported prepared Codex session action: ${JSON.stringify(action)}`,
  );
}

async function settleSupersededResult(
  options: AdvanceCodexAnalysisSessionOptions,
): Promise<CodexThreadRegistryV1> {
  const prepared = options.prepared;
  if (prepared.action !== 'analysisResult') {
    throw new CodexAnalysisSessionAdvanceError(
      'invalid_stage',
      'Codex superseded result settlement requires a recovered result',
    );
  }
  const completion = getCompletionKind(prepared.state);
  if (completion === 'initial') {
    return activateCodexInitialAnalysisTurn({
      localSessionId: prepared.state.localSessionId,
      turnId: prepared.turn.id,
      reasoningEffort: prepared.delivery.reasoningEffort,
      updateRegistry: options.updateRegistry,
      now: options.now,
    });
  }
  return completeCodexAnalysisUpdateTurn({
    localSessionId: prepared.state.localSessionId,
    turnId: prepared.turn.id,
    reasoningEffort: prepared.delivery.reasoningEffort,
    updateRegistry: options.updateRegistry,
    now: options.now,
  });
}

async function resolveDelivery(options: AdvanceCodexAnalysisSessionOptions): Promise<{
  registry: CodexThreadRegistryV1;
  state: CodexThreadState;
  delivery: PrepareCodexAnalysisDeliveryInput;
}> {
  const plan = planCodexAnalysisDelivery(
    options.prepared.state.pendingAnalysis,
    options.target,
    options.createDeliveryId ?? randomUUID,
  );
  if (plan.kind === 'recover') {
    throw new CodexAnalysisSessionAdvanceError(
      'recovery_required',
      `Codex accepted turn "${plan.pending.turnId}" requires recovery before sending`,
    );
  }
  if (plan.kind !== 'replace') {
    return {
      registry: options.prepared.registry,
      state: options.prepared.state,
      delivery: plan.delivery,
    };
  }

  const cancelledAt = (options.now ?? (() => new Date()))().toISOString();
  const registry = await options.updateRegistry((current) =>
    cancelPreparedCodexAnalysisDelivery(
      current,
      options.prepared.state.localSessionId,
      plan.pending,
      cancelledAt,
    ),
  );
  return {
    registry,
    state: getSession(registry, options.prepared.state.localSessionId),
    delivery: plan.delivery,
  };
}

/**
 * Advances one prepared Codex analysis session by at most one new external turn.
 * @param options - Prepared session, current request, delivery target, and persistence boundary.
 * @returns A busy state, a continuation state, or a parsed result awaiting caller persistence.
 * @throws When recovery state, pending identity, or a persisted transition is inconsistent.
 */
export async function advanceCodexAnalysisSession(
  options: AdvanceCodexAnalysisSessionOptions,
): Promise<CodexAnalysisSessionAdvance> {
  const prepared = options.prepared;
  if (prepared.action === 'busy') {
    return {
      action: 'busy',
      registry: prepared.registry,
      state: prepared.state,
      thread: prepared.thread,
      turnId: prepared.turnId,
    };
  }

  if (prepared.action === 'analysisResult') {
    const completion = getCompletionKind(prepared.state);
    if (isCodexAnalysisResultApplicable(prepared.delivery, options.target)) {
      return {
        action: 'result',
        source: 'recovered',
        completion,
        registry: prepared.registry,
        state: prepared.state,
        thread: prepared.thread,
        delivery: prepared.delivery,
        turn: prepared.turn,
        message: prepared.message,
        result: prepared.result,
      };
    }

    const registry = await settleSupersededResult(options);
    return {
      action: 'continue',
      reason: 'superseded_result',
      registry,
      state: getSession(registry, prepared.state.localSessionId),
      thread: prepared.thread,
    };
  }

  if (prepared.action === 'sendPrompt') {
    const completed = await sendCodexPromptTurn({
      state: prepared.state,
      text: options.systemPrompt,
      reasoningEffort: options.target.reasoningEffort,
      timeoutMs: options.timeoutMs,
      connection: options.connection,
      updateRegistry: options.updateRegistry,
      now: options.now,
    });
    return {
      action: 'continue',
      reason: 'prompt_completed',
      registry: completed.registry,
      state: getSession(completed.registry, prepared.state.localSessionId),
      thread: prepared.thread,
    };
  }

  switch (prepared.action) {
    case 'sendAnalysis':
    case 'ready':
      break;
    default:
      return rejectUnsupportedPreparedAction(prepared.action);
  }

  const resolved = await resolveDelivery(options);
  const completion = getCompletionKind(resolved.state);
  const completed =
    completion === 'initial'
      ? await sendCodexInitialAnalysisTurn({
          registry: resolved.registry,
          state: resolved.state,
          payload: options.payload,
          delivery: resolved.delivery,
          timeoutMs: options.timeoutMs,
          connection: options.connection,
          updateRegistry: options.updateRegistry,
          now: options.now,
        })
      : await sendCodexAnalysisUpdateTurn({
          registry: resolved.registry,
          state: resolved.state,
          payload: options.payload,
          delivery: resolved.delivery,
          timeoutMs: options.timeoutMs,
          connection: options.connection,
          updateRegistry: options.updateRegistry,
          now: options.now,
        });
  return {
    action: 'result',
    source: 'sent',
    completion,
    registry: completed.registry,
    state: getSession(completed.registry, prepared.state.localSessionId),
    thread: prepared.thread,
    delivery: resolved.delivery,
    turn: completed.turn,
    message: completed.message,
    result: completed.result,
  };
}
