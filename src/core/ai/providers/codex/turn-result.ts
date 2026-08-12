import type { CodexAgentMessage, CodexErrorInfo, CodexTurnInfo } from '@/infra/codex';

export type CodexTurnResultErrorCode =
  | 'turn_in_progress'
  | 'turn_failed'
  | 'turn_interrupted'
  | 'final_message_missing';

export class CodexTurnResultError extends Error {
  readonly code: CodexTurnResultErrorCode;
  readonly turnId: string;
  readonly codexErrorInfo: CodexErrorInfo | null;

  constructor(
    code: CodexTurnResultErrorCode,
    turnId: string,
    message: string,
    codexErrorInfo: CodexErrorInfo | null = null,
  ) {
    super(message);
    this.name = 'CodexTurnResultError';
    this.code = code;
    this.turnId = turnId;
    this.codexErrorInfo = codexErrorInfo;
  }
}

/**
 * Validates that a Codex turn completed successfully.
 * @param turn - Turn returned by the App Server.
 * @throws {CodexTurnResultError} When the turn has not completed successfully.
 */
export function assertCodexTurnCompleted(turn: CodexTurnInfo): void {
  switch (turn.status) {
    case 'completed':
      return;
    case 'inProgress':
      throw new CodexTurnResultError(
        'turn_in_progress',
        turn.id,
        `Codex turn "${turn.id}" is still in progress`,
      );
    case 'interrupted':
      throw new CodexTurnResultError(
        'turn_interrupted',
        turn.id,
        `Codex turn "${turn.id}" was interrupted`,
      );
    case 'failed':
      throw new CodexTurnResultError(
        'turn_failed',
        turn.id,
        turn.error?.message ?? `Codex turn "${turn.id}" failed`,
        turn.error?.codexErrorInfo ?? null,
      );
  }
}

function findLastMessage(
  messages: readonly CodexAgentMessage[],
  phase: CodexAgentMessage['phase'],
): CodexAgentMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.phase === phase && message.text.trim() !== '') return message;
  }
  return undefined;
}

/**
 * Selects the final agent message from a successfully completed turn.
 * @param turn - Turn containing completed agent messages.
 * @returns The latest final answer, or the latest unphased message for compatibility.
 * @throws {CodexTurnResultError} When the turn failed or has no final message.
 */
export function selectCodexFinalMessage(turn: CodexTurnInfo): CodexAgentMessage {
  assertCodexTurnCompleted(turn);
  const message =
    findLastMessage(turn.agentMessages, 'final_answer') ??
    findLastMessage(turn.agentMessages, null);
  if (!message) {
    throw new CodexTurnResultError(
      'final_message_missing',
      turn.id,
      `Codex turn "${turn.id}" has no final agent message`,
    );
  }
  return message;
}
