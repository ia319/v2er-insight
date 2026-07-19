import type { CodexTurnInfo } from '@/infra/codex';
import type { CodexRuntimeConnection } from './runtime-selection';
import type { CodexThreadRegistryV1, CodexThreadState } from './thread-state';
import { completeCodexPromptTurn, recordCodexPromptTurn } from './thread-registry';
import { assertCodexTurnCompleted } from './turn-result';

export type CodexRegistryUpdate = (
  update: (registry: CodexThreadRegistryV1) => CodexThreadRegistryV1,
) => CodexThreadRegistryV1 | Promise<CodexThreadRegistryV1>;

export type CodexPromptTurnErrorCode =
  | 'invalid_stage'
  | 'turn_already_started'
  | 'acceptance_not_persisted'
  | 'completion_not_persisted';

/** Reports an invalid prompt stage or missing registry transition. */
export class CodexPromptTurnError extends Error {
  readonly code: CodexPromptTurnErrorCode;

  constructor(code: CodexPromptTurnErrorCode, message: string) {
    super(message);
    this.name = 'CodexPromptTurnError';
    this.code = code;
  }
}

export interface SendCodexPromptTurnOptions {
  state: CodexThreadState;
  text: string;
  reasoningEffort: string;
  timeoutMs: number;
  connection: Pick<CodexRuntimeConnection, 'runTurn'>;
  updateRegistry: CodexRegistryUpdate;
  now?: () => Date;
}

export interface CompletedCodexPromptTurn {
  registry: CodexThreadRegistryV1;
  turn: CodexTurnInfo;
}

function assertPromptCanStart(state: CodexThreadState): void {
  if (state.bootstrapStatus !== 'promptPending') {
    throw new CodexPromptTurnError(
      'invalid_stage',
      `Codex session "${state.localSessionId}" is not awaiting a prompt turn`,
    );
  }
  if (state.promptTurnId !== null) {
    throw new CodexPromptTurnError(
      'turn_already_started',
      `Codex prompt turn "${state.promptTurnId}" already started`,
    );
  }
}

function assertPromptTransitionPersisted(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  turnId: string,
  status: CodexThreadState['bootstrapStatus'],
  code: 'acceptance_not_persisted' | 'completion_not_persisted',
): void {
  const state = registry.sessions.find((session) => session.localSessionId === localSessionId);
  if (state?.bootstrapStatus !== status || state.promptTurnId !== turnId) {
    throw new CodexPromptTurnError(
      code,
      `Codex prompt turn "${turnId}" transition was not persisted`,
    );
  }
}

/**
 * Sends the ordinary prompt message and persists both accepted and completed transitions.
 * @param options - Pending session, prompt text, selected effort, deadline, and registry boundary.
 * @returns The completed turn and registry advanced to analysis-pending.
 * @throws {CodexPromptTurnError} When the stage is invalid or a transition is not persisted.
 */
export async function sendCodexPromptTurn(
  options: SendCodexPromptTurnOptions,
): Promise<CompletedCodexPromptTurn> {
  assertPromptCanStart(options.state);
  const now = options.now ?? (() => new Date());

  const turn = await options.connection.runTurn(
    {
      threadId: options.state.threadId,
      text: options.text,
      cwd: options.state.projectPath,
      model: options.state.model,
      effort: options.reasoningEffort,
    },
    options.timeoutMs,
    async (started) => {
      const usedAt = now().toISOString();
      const registry = await options.updateRegistry((current) =>
        recordCodexPromptTurn(current, options.state.localSessionId, started.id, usedAt),
      );
      assertPromptTransitionPersisted(
        registry,
        options.state.localSessionId,
        started.id,
        'promptPending',
        'acceptance_not_persisted',
      );
    },
  );

  assertCodexTurnCompleted(turn);
  const completedAt = now().toISOString();
  const registry = await options.updateRegistry((current) =>
    completeCodexPromptTurn(current, options.state.localSessionId, turn.id, completedAt),
  );
  assertPromptTransitionPersisted(
    registry,
    options.state.localSessionId,
    turn.id,
    'analysisPending',
    'completion_not_persisted',
  );
  return { registry, turn };
}
