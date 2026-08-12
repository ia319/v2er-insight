import { randomUUID } from 'node:crypto';
import type { CodexAgentMessage, CodexTurnInfo } from '@/infra/codex';
import type { CodexRegistryUpdate } from './registry-update';
import type { CodexRuntimeConnection } from './runtime-selection';
import { resumeCodexThread } from './thread-resume';
import type { CodexThreadRegistryV1, CodexThreadState } from './thread-state';
import { completeCodexThreadTurn, recordCodexThreadTurnStart } from './thread-registry';
import { selectCodexFinalMessage } from './turn-result';

export type CodexChatTurnErrorCode =
  | 'session_not_active'
  | 'thread_busy'
  | 'acceptance_not_persisted'
  | 'completion_not_persisted';

/** Reports an unsafe Codex chat state or an unpersisted turn transition. */
export class CodexChatTurnError extends Error {
  readonly code: CodexChatTurnErrorCode;

  constructor(code: CodexChatTurnErrorCode, message: string) {
    super(message);
    this.name = 'CodexChatTurnError';
    this.code = code;
  }
}

export interface SendCodexChatTurnOptions {
  registry: CodexThreadRegistryV1;
  state: CodexThreadState;
  message: string;
  reasoningEffort: string;
  timeoutMs: number;
  connection: Pick<CodexRuntimeConnection, 'resumeThread' | 'readThread' | 'runTurn'>;
  updateRegistry: CodexRegistryUpdate;
  createAttemptId?: () => string;
  now?: () => Date;
  platform?: NodeJS.Platform;
}

export interface CompletedCodexChatTurn {
  registry: CodexThreadRegistryV1;
  turn: CodexTurnInfo;
  message: CodexAgentMessage;
}

function assertReadyActiveSession(options: SendCodexChatTurnOptions): void {
  const persisted = options.registry.sessions.find(
    (session) => session.localSessionId === options.state.localSessionId,
  );
  if (
    options.message === '' ||
    options.registry.activeSessionId !== options.state.localSessionId ||
    persisted?.bootstrapStatus !== 'ready' ||
    persisted.threadId !== options.state.threadId ||
    persisted.lastTurnId !== options.state.lastTurnId ||
    persisted.pendingAnalysis !== undefined
  ) {
    throw new CodexChatTurnError(
      'session_not_active',
      `Codex session "${options.state.localSessionId}" is not ready for chat`,
    );
  }
}

function assertTurnPersisted(
  registry: CodexThreadRegistryV1,
  localSessionId: string,
  turnId: string,
  reasoningEffort: string | null,
  code: 'acceptance_not_persisted' | 'completion_not_persisted',
): void {
  const state = registry.sessions.find((session) => session.localSessionId === localSessionId);
  if (
    registry.activeSessionId !== localSessionId ||
    state?.bootstrapStatus !== 'ready' ||
    state.lastTurnId !== turnId ||
    state.pendingAnalysis !== undefined ||
    (reasoningEffort !== null && state.lastReasoningEffort !== reasoningEffort)
  ) {
    throw new CodexChatTurnError(code, `Codex chat turn "${turnId}" was not persisted`);
  }
}

/**
 * Resumes one exact Codex thread and sends a plain text turn without an output schema.
 * @param options - Active session snapshot, runtime, message, deadline, and persistence boundary.
 * @returns The completed turn, final agent message, and updated registry.
 * @throws {CodexChatTurnError} When the session is unsafe or a state transition is not persisted.
 */
export async function sendCodexChatTurn(
  options: SendCodexChatTurnOptions,
): Promise<CompletedCodexChatTurn> {
  assertReadyActiveSession(options);
  const resumed = await resumeCodexThread({
    state: options.state,
    connection: options.connection,
    platform: options.platform,
  });
  if (resumed.thread.status.type === 'active') {
    throw new CodexChatTurnError(
      'thread_busy',
      `Codex thread "${options.state.threadId}" has an active turn`,
    );
  }

  const now = options.now ?? (() => new Date());
  let acceptedRegistry: CodexThreadRegistryV1 | undefined;
  const turn = await options.connection.runTurn(
    {
      threadId: options.state.threadId,
      text: options.message,
      cwd: options.state.projectPath,
      model: options.state.model,
      effort: options.reasoningEffort,
      clientUserMessageId: (options.createAttemptId ?? randomUUID)(),
    },
    options.timeoutMs,
    async (started) => {
      acceptedRegistry = await options.updateRegistry((current) => {
        if (current.activeSessionId !== options.state.localSessionId) {
          throw new CodexChatTurnError(
            'session_not_active',
            `Codex session "${options.state.localSessionId}" is no longer active`,
          );
        }
        return recordCodexThreadTurnStart(
          current,
          options.state.localSessionId,
          started.id,
          now().toISOString(),
        );
      });
      assertTurnPersisted(
        acceptedRegistry,
        options.state.localSessionId,
        started.id,
        null,
        'acceptance_not_persisted',
      );
    },
  );
  const message = selectCodexFinalMessage(turn);
  if (!acceptedRegistry) {
    throw new CodexChatTurnError(
      'acceptance_not_persisted',
      `Codex chat turn "${turn.id}" has no persisted acceptance`,
    );
  }

  const completedRegistry = await options.updateRegistry((current) =>
    completeCodexThreadTurn(
      current,
      options.state.localSessionId,
      turn.id,
      options.reasoningEffort,
      now().toISOString(),
    ),
  );
  assertTurnPersisted(
    completedRegistry,
    options.state.localSessionId,
    turn.id,
    options.reasoningEffort,
    'completion_not_persisted',
  );
  return { registry: completedRegistry, turn, message };
}
