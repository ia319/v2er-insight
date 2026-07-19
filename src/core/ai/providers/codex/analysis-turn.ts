import type { AIAnalysisResult } from '../../types';
import { parseAIAnalysisResult } from '../../result-parser';
import { AI_ANALYSIS_RESULT_JSON_SCHEMA } from '../../result-schema';
import type { CodexAgentMessage, CodexTurnInfo } from '@/infra/codex';
import type { CodexRegistryUpdate } from './registry-update';
import type { CodexRuntimeConnection } from './runtime-selection';
import { activateCodexThreadSession, recordCodexInitialAnalysisTurn } from './thread-registry';
import type { CodexThreadRegistryV1, CodexThreadState } from './thread-state';
import { assertCodexTurnCompleted, selectCodexFinalMessage } from './turn-result';

export type CodexAnalysisTurnErrorCode =
  | 'invalid_stage'
  | 'turn_already_started'
  | 'delivery_id_invalid'
  | 'acceptance_not_persisted'
  | 'activation_not_persisted';

/** Reports an invalid analysis stage, delivery identity, or registry transition. */
export class CodexAnalysisTurnError extends Error {
  readonly code: CodexAnalysisTurnErrorCode;

  constructor(code: CodexAnalysisTurnErrorCode, message: string) {
    super(message);
    this.name = 'CodexAnalysisTurnError';
    this.code = code;
  }
}

export interface SendCodexInitialAnalysisTurnOptions {
  state: CodexThreadState;
  payload: string;
  deliveryId: string;
  reasoningEffort: string;
  timeoutMs: number;
  connection: Pick<CodexRuntimeConnection, 'runTurn'>;
  updateRegistry: CodexRegistryUpdate;
  now?: () => Date;
}

export interface CompletedCodexInitialAnalysisTurn {
  registry: CodexThreadRegistryV1;
  turn: CodexTurnInfo;
  message: CodexAgentMessage;
  result: AIAnalysisResult;
}

export interface ActivateCodexInitialAnalysisTurnOptions {
  localSessionId: string;
  turnId: string;
  reasoningEffort: string;
  updateRegistry: CodexRegistryUpdate;
  now?: () => Date;
}

function assertAnalysisCanStart(options: SendCodexInitialAnalysisTurnOptions): void {
  if (options.state.bootstrapStatus !== 'analysisPending') {
    throw new CodexAnalysisTurnError(
      'invalid_stage',
      `Codex session "${options.state.localSessionId}" is not awaiting initial analysis`,
    );
  }
  if (options.state.initialAnalysisTurnId !== null) {
    throw new CodexAnalysisTurnError(
      'turn_already_started',
      `Codex analysis turn "${options.state.initialAnalysisTurnId}" already started`,
    );
  }
  if (options.deliveryId.trim() === '' || options.deliveryId.trim() !== options.deliveryId) {
    throw new CodexAnalysisTurnError('delivery_id_invalid', 'Codex delivery ID is invalid');
  }
}

function assertAnalysisTransitionPersisted(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  turnId: string,
  status: 'analysisPending' | 'ready',
  code: 'acceptance_not_persisted' | 'activation_not_persisted',
  reasoningEffort?: string,
): void {
  const state = registry.sessions.find((session) => session.localSessionId === localSessionId);
  const activeMatches = status !== 'ready' || registry.activeSessionId === localSessionId;
  const effortMatches = status !== 'ready' || state?.lastReasoningEffort === reasoningEffort;
  if (
    state?.bootstrapStatus !== status ||
    state.initialAnalysisTurnId !== turnId ||
    state.lastTurnId !== turnId ||
    !activeMatches ||
    !effortMatches
  ) {
    throw new CodexAnalysisTurnError(
      code,
      `Codex analysis turn "${turnId}" transition was not persisted`,
    );
  }
}

/**
 * Sends one complete initial analysis payload and parses its structured result.
 * @param options - Analysis-pending session, payload, delivery identity, effort, and persistence boundary.
 * @returns The validated result, final message, completed turn, and analysis-pending registry.
 * @throws {CodexAnalysisTurnError} When the stage, delivery ID, or persistence is invalid.
 */
export async function sendCodexInitialAnalysisTurn(
  options: SendCodexInitialAnalysisTurnOptions,
): Promise<CompletedCodexInitialAnalysisTurn> {
  assertAnalysisCanStart(options);
  const now = options.now ?? (() => new Date());
  let acceptedRegistry: CodexThreadRegistryV1 | undefined;

  const turn = await options.connection.runTurn(
    {
      threadId: options.state.threadId,
      text: options.payload,
      cwd: options.state.projectPath,
      model: options.state.model,
      effort: options.reasoningEffort,
      clientUserMessageId: options.deliveryId,
      outputSchema: AI_ANALYSIS_RESULT_JSON_SCHEMA,
    },
    options.timeoutMs,
    async (started) => {
      const usedAt = now().toISOString();
      const registry = await options.updateRegistry((current) =>
        recordCodexInitialAnalysisTurn(current, options.state.localSessionId, started.id, usedAt),
      );
      assertAnalysisTransitionPersisted(
        registry,
        options.state.localSessionId,
        started.id,
        'analysisPending',
        'acceptance_not_persisted',
      );
      acceptedRegistry = registry;
    },
  );

  assertCodexTurnCompleted(turn);
  const message = selectCodexFinalMessage(turn);
  const result = parseAIAnalysisResult(message.text);
  if (!acceptedRegistry) {
    throw new CodexAnalysisTurnError(
      'acceptance_not_persisted',
      `Codex analysis turn "${turn.id}" has no persisted acceptance`,
    );
  }
  return { registry: acceptedRegistry, turn, message, result };
}

/**
 * Activates an initial analysis turn after its result and provenance are stored.
 * @param options - Completed turn identity, successful effort, clock, and registry boundary.
 * @returns The registry with the session active and ready.
 * @throws {CodexAnalysisTurnError} When the activation transition is not persisted.
 */
export async function activateCodexInitialAnalysisTurn(
  options: ActivateCodexInitialAnalysisTurnOptions,
): Promise<CodexThreadRegistryV1> {
  const activatedAt = (options.now ?? (() => new Date()))().toISOString();
  const registry = await options.updateRegistry((current) =>
    activateCodexThreadSession(
      current,
      options.localSessionId,
      options.turnId,
      options.reasoningEffort,
      activatedAt,
    ),
  );
  assertAnalysisTransitionPersisted(
    registry,
    options.localSessionId,
    options.turnId,
    'ready',
    'activation_not_persisted',
    options.reasoningEffort,
  );
  return registry;
}
