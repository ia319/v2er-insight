import type { AIAnalysisResult } from '../../types';
import { parseAIAnalysisResult } from '../../result-parser';
import { AI_ANALYSIS_RESULT_JSON_SCHEMA } from '../../result-schema';
import type { CodexAgentMessage, CodexTurnInfo } from '@/infra/codex';
import type { CodexRegistryUpdate } from './registry-update';
import type { CodexRuntimeConnection } from './runtime-selection';
import {
  activateCodexThreadSession,
  completeCodexThreadTurn,
  prepareCodexAnalysisDelivery,
  recordCodexInitialAnalysisTurn,
  recordCodexThreadTurnStart,
} from './thread-registry';
import type {
  CodexPendingAnalysisDelivery,
  CodexThreadRegistryV1,
  CodexThreadState,
  PrepareCodexAnalysisDeliveryInput,
} from './thread-state';
import { assertCodexTurnCompleted, selectCodexFinalMessage } from './turn-result';
import { matchesCodexAnalysisDelivery } from './analysis-delivery';

export type CodexAnalysisTurnErrorCode =
  | 'invalid_stage'
  | 'turn_already_started'
  | 'delivery_identity_invalid'
  | 'session_not_active'
  | 'preparation_not_persisted'
  | 'acceptance_not_persisted'
  | 'activation_not_persisted'
  | 'completion_not_persisted';

/** Reports an invalid analysis stage, delivery identity, or registry transition. */
export class CodexAnalysisTurnError extends Error {
  readonly code: CodexAnalysisTurnErrorCode;

  constructor(code: CodexAnalysisTurnErrorCode, message: string) {
    super(message);
    this.name = 'CodexAnalysisTurnError';
    this.code = code;
  }
}

interface SendCodexAnalysisTurnOptions {
  registry: CodexThreadRegistryV1;
  state: CodexThreadState;
  payload: string;
  delivery: PrepareCodexAnalysisDeliveryInput;
  timeoutMs: number;
  connection: Pick<CodexRuntimeConnection, 'runTurn'>;
  updateRegistry: CodexRegistryUpdate;
  now?: () => Date;
}

export type SendCodexInitialAnalysisTurnOptions = SendCodexAnalysisTurnOptions;

export type SendCodexAnalysisUpdateTurnOptions = SendCodexAnalysisTurnOptions;

export interface CompletedCodexAnalysisTurn {
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

export interface CompleteCodexAnalysisUpdateTurnOptions {
  localSessionId: string;
  turnId: string;
  reasoningEffort: string;
  updateRegistry: CodexRegistryUpdate;
  now?: () => Date;
}

function assertAnalysisCanStart(options: SendCodexInitialAnalysisTurnOptions): void {
  assertSessionSnapshot(options);
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
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isNormalizedNonBlank(value: string): boolean {
  return value.trim() !== '' && value.trim() === value;
}

function assertDeliveryIdentity(delivery: PrepareCodexAnalysisDeliveryInput): void {
  if (
    !isNormalizedNonBlank(delivery.deliveryId) ||
    !isNormalizedNonBlank(delivery.providerKey) ||
    !SHA256_PATTERN.test(delivery.analysisFingerprint) ||
    !SHA256_PATTERN.test(delivery.payloadHash) ||
    !isNormalizedNonBlank(delivery.reasoningEffort)
  ) {
    throw new CodexAnalysisTurnError(
      'delivery_identity_invalid',
      'Codex analysis delivery identity is invalid',
    );
  }
}

function pendingStatesMatch(
  first: CodexPendingAnalysisDelivery | undefined,
  second: CodexPendingAnalysisDelivery | undefined,
): boolean {
  if (first === undefined || second === undefined) return first === second;
  return first.turnId === second.turnId && matchesCodexAnalysisDelivery(first, second);
}

function assertSessionSnapshot(options: SendCodexAnalysisTurnOptions): CodexThreadState {
  const persisted = options.registry.sessions.find(
    (session) => session.localSessionId === options.state.localSessionId,
  );
  if (
    persisted?.threadId !== options.state.threadId ||
    persisted.promptHash !== options.state.promptHash ||
    persisted.bootstrapStatus !== options.state.bootstrapStatus ||
    persisted.promptTurnId !== options.state.promptTurnId ||
    persisted.initialAnalysisTurnId !== options.state.initialAnalysisTurnId ||
    persisted.lastTurnId !== options.state.lastTurnId ||
    persisted.model !== options.state.model ||
    persisted.projectPath !== options.state.projectPath ||
    !pendingStatesMatch(persisted.pendingAnalysis, options.state.pendingAnalysis)
  ) {
    throw new CodexAnalysisTurnError(
      'session_not_active',
      `Codex session "${options.state.localSessionId}" changed before analysis delivery`,
    );
  }
  return persisted;
}

function assertUpdateCanStart(options: SendCodexAnalysisUpdateTurnOptions): void {
  const persisted = assertSessionSnapshot(options);
  if (options.state.bootstrapStatus !== 'ready' || persisted.bootstrapStatus !== 'ready') {
    throw new CodexAnalysisTurnError(
      'invalid_stage',
      `Codex session "${options.state.localSessionId}" is not ready for analysis updates`,
    );
  }
  if (
    options.registry.activeSessionId !== options.state.localSessionId ||
    persisted.threadId !== options.state.threadId ||
    persisted.lastTurnId !== options.state.lastTurnId
  ) {
    throw new CodexAnalysisTurnError(
      'session_not_active',
      `Codex session "${options.state.localSessionId}" is not the current active session`,
    );
  }
}

function assertPreparedAnalysisTransition(
  registry: CodexThreadRegistryV1,
  state: CodexThreadState,
  delivery: PrepareCodexAnalysisDeliveryInput,
): void {
  const persisted = registry.sessions.find(
    (session) => session.localSessionId === state.localSessionId,
  );
  if (
    persisted?.bootstrapStatus !== state.bootstrapStatus ||
    persisted.threadId !== state.threadId ||
    persisted.lastTurnId !== state.lastTurnId ||
    persisted.pendingAnalysis?.turnId !== null ||
    !matchesCodexAnalysisDelivery(persisted.pendingAnalysis, delivery)
  ) {
    throw new CodexAnalysisTurnError(
      'preparation_not_persisted',
      `Codex analysis delivery "${delivery.deliveryId}" was not persisted`,
    );
  }
}

async function ensureAnalysisDeliveryPrepared(
  options: SendCodexAnalysisTurnOptions,
): Promise<void> {
  assertDeliveryIdentity(options.delivery);
  if (options.state.pendingAnalysis !== undefined) {
    if (
      options.state.pendingAnalysis.turnId !== null ||
      !matchesCodexAnalysisDelivery(options.state.pendingAnalysis, options.delivery)
    ) {
      throw new CodexAnalysisTurnError(
        'turn_already_started',
        `Codex session "${options.state.localSessionId}" has a different pending analysis`,
      );
    }
    return;
  }

  const preparedAt = (options.now ?? (() => new Date()))().toISOString();
  const registry = await options.updateRegistry((current) =>
    prepareCodexAnalysisDelivery(
      current,
      options.state.localSessionId,
      options.delivery,
      preparedAt,
    ),
  );
  assertPreparedAnalysisTransition(registry, options.state, options.delivery);
}

function assertInitialAnalysisTransitionPersisted(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  turnId: string,
  status: 'analysisPending' | 'ready',
  code: 'acceptance_not_persisted' | 'activation_not_persisted',
  reasoningEffort?: string,
  delivery?: PrepareCodexAnalysisDeliveryInput,
): void {
  const state = registry.sessions.find((session) => session.localSessionId === localSessionId);
  const activeMatches = status !== 'ready' || registry.activeSessionId === localSessionId;
  const effortMatches = status !== 'ready' || state?.lastReasoningEffort === reasoningEffort;
  const pendingMatches =
    status === 'ready'
      ? state?.pendingAnalysis === undefined
      : state?.pendingAnalysis !== undefined &&
        state.pendingAnalysis.turnId === turnId &&
        delivery !== undefined &&
        matchesCodexAnalysisDelivery(state.pendingAnalysis, delivery);
  if (
    state?.bootstrapStatus !== status ||
    state.initialAnalysisTurnId !== turnId ||
    state.lastTurnId !== turnId ||
    !activeMatches ||
    !effortMatches ||
    !pendingMatches
  ) {
    throw new CodexAnalysisTurnError(
      code,
      `Codex analysis turn "${turnId}" transition was not persisted`,
    );
  }
}

function assertReadyAnalysisTransitionPersisted(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  turnId: string,
  code: 'acceptance_not_persisted' | 'completion_not_persisted',
  reasoningEffort?: string | null,
  delivery?: PrepareCodexAnalysisDeliveryInput,
): void {
  const state = registry.sessions.find((session) => session.localSessionId === localSessionId);
  const effortMatches =
    reasoningEffort === undefined || state?.lastReasoningEffort === reasoningEffort;
  const pendingMatches =
    delivery === undefined
      ? state?.pendingAnalysis === undefined
      : state?.pendingAnalysis !== undefined &&
        state.pendingAnalysis.turnId === turnId &&
        matchesCodexAnalysisDelivery(state.pendingAnalysis, delivery);
  if (
    registry.activeSessionId !== localSessionId ||
    state?.bootstrapStatus !== 'ready' ||
    state.lastTurnId !== turnId ||
    !effortMatches ||
    !pendingMatches
  ) {
    throw new CodexAnalysisTurnError(
      code,
      `Codex analysis update turn "${turnId}" transition was not persisted`,
    );
  }
}

type PersistAcceptedAnalysisTurn = (
  turnId: string,
  usedAt: string,
) => Promise<CodexThreadRegistryV1>;

async function runStructuredAnalysisTurn(
  options: SendCodexAnalysisTurnOptions,
  persistAccepted: PersistAcceptedAnalysisTurn,
): Promise<CompletedCodexAnalysisTurn> {
  const now = options.now ?? (() => new Date());
  let acceptedRegistry: CodexThreadRegistryV1 | undefined;

  const turn = await options.connection.runTurn(
    {
      threadId: options.state.threadId,
      text: options.payload,
      cwd: options.state.projectPath,
      model: options.state.model,
      effort: options.delivery.reasoningEffort,
      clientUserMessageId: options.delivery.deliveryId,
      outputSchema: AI_ANALYSIS_RESULT_JSON_SCHEMA,
    },
    options.timeoutMs,
    async (started) => {
      acceptedRegistry = await persistAccepted(started.id, now().toISOString());
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
 * Sends one complete initial analysis payload and parses its structured result.
 * @param options - Analysis-pending session, payload, delivery identity, effort, and persistence boundary.
 * @returns The validated result, final message, completed turn, and analysis-pending registry.
 * @throws {CodexAnalysisTurnError} When the stage, delivery ID, or persistence is invalid.
 */
export async function sendCodexInitialAnalysisTurn(
  options: SendCodexInitialAnalysisTurnOptions,
): Promise<CompletedCodexAnalysisTurn> {
  assertAnalysisCanStart(options);
  await ensureAnalysisDeliveryPrepared(options);
  return runStructuredAnalysisTurn(options, async (turnId, usedAt) => {
    const registry = await options.updateRegistry((current) =>
      recordCodexInitialAnalysisTurn(current, options.state.localSessionId, turnId, usedAt),
    );
    assertInitialAnalysisTransitionPersisted(
      registry,
      options.state.localSessionId,
      turnId,
      'analysisPending',
      'acceptance_not_persisted',
      undefined,
      options.delivery,
    );
    return registry;
  });
}

/**
 * Sends one complete analysis update on the active ready session.
 * @param options - Active registry snapshot, ready session, payload, delivery identity, and runtime settings.
 * @returns The validated result while successful effort metadata remains pending caller persistence.
 * @throws {CodexAnalysisTurnError} When session, delivery, or acceptance persistence is invalid.
 */
export async function sendCodexAnalysisUpdateTurn(
  options: SendCodexAnalysisUpdateTurnOptions,
): Promise<CompletedCodexAnalysisTurn> {
  assertUpdateCanStart(options);
  await ensureAnalysisDeliveryPrepared(options);
  return runStructuredAnalysisTurn(options, async (turnId, usedAt) => {
    const registry = await options.updateRegistry((current) => {
      if (current.activeSessionId !== options.state.localSessionId) {
        throw new CodexAnalysisTurnError(
          'session_not_active',
          `Codex session "${options.state.localSessionId}" is no longer active`,
        );
      }
      return recordCodexThreadTurnStart(current, options.state.localSessionId, turnId, usedAt);
    });
    assertReadyAnalysisTransitionPersisted(
      registry,
      options.state.localSessionId,
      turnId,
      'acceptance_not_persisted',
      options.state.lastReasoningEffort,
      options.delivery,
    );
    return registry;
  });
}

/**
 * Activates an initial analysis turn after its completed result is persisted or superseded.
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
  assertInitialAnalysisTransitionPersisted(
    registry,
    options.localSessionId,
    options.turnId,
    'ready',
    'activation_not_persisted',
    options.reasoningEffort,
  );
  return registry;
}

/**
 * Completes a ready-session analysis update after its completed result is persisted or superseded.
 * @param options - Completed turn identity, successful effort, clock, and registry boundary.
 * @returns The active registry with updated successful effort metadata.
 * @throws {CodexAnalysisTurnError} When the session changes or completion is not persisted.
 */
export async function completeCodexAnalysisUpdateTurn(
  options: CompleteCodexAnalysisUpdateTurnOptions,
): Promise<CodexThreadRegistryV1> {
  const completedAt = (options.now ?? (() => new Date()))().toISOString();
  const registry = await options.updateRegistry((current) => {
    if (current.activeSessionId !== options.localSessionId) {
      throw new CodexAnalysisTurnError(
        'session_not_active',
        `Codex session "${options.localSessionId}" is no longer active`,
      );
    }
    return completeCodexThreadTurn(
      current,
      options.localSessionId,
      options.turnId,
      options.reasoningEffort,
      completedAt,
    );
  });
  assertReadyAnalysisTransitionPersisted(
    registry,
    options.localSessionId,
    options.turnId,
    'completion_not_persisted',
    options.reasoningEffort,
  );
  return registry;
}
