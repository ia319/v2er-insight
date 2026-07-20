import { CodexAppServerProtocolError, CodexTurnWaitTimeoutError } from './errors';
import type { CodexSessionNotification } from './notification-types';
import type { CodexAgentMessage, CodexTurnInfo } from './thread-types';

interface PendingTurn {
  promise: Promise<CodexTurnInfo>;
  resolve: (turn: CodexTurnInfo) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

function validateTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs must be a positive finite number');
  }
}

/** Collects terminal turn notifications, including events received before the start response. */
export class CodexTurnCompletionCollector {
  private readonly threadId: string;
  private readonly completed = new Map<string, CodexTurnInfo>();
  private readonly messages = new Map<string, Map<string, CodexAgentMessage>>();
  private readonly pending = new Map<string, PendingTurn>();
  private failure?: Error;

  constructor(threadId: string) {
    if (threadId.trim() === '') throw new RangeError('threadId must not be blank');
    this.threadId = threadId;
  }

  /** Records one decoded session notification for the tracked thread. */
  accept(notification: CodexSessionNotification): void {
    if (notification.threadId !== this.threadId) return;
    if (notification.kind === 'itemCompleted' && notification.message) {
      this.recordMessage(notification.turnId, notification.message);
      return;
    }
    if (notification.kind !== 'turnCompleted') return;
    if (notification.turn.status === 'inProgress') {
      throw new CodexAppServerProtocolError(
        `turn/completed reported inProgress for turn "${notification.turn.id}"`,
      );
    }
    this.complete(notification.turn);
  }

  /** Rejects current and future waits after a notification or transport failure. */
  fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const [turnId, pending] of this.pending) {
      this.pending.delete(turnId);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  /** Returns one shared pending wait for a terminal turn notification. */
  waitFor(turnId: string, timeoutMs: number): Promise<CodexTurnInfo> {
    if (turnId.trim() === '') return Promise.reject(new RangeError('turnId must not be blank'));
    validateTimeout(timeoutMs);

    const completed = this.completed.get(turnId);
    if (completed) return Promise.resolve(completed);
    if (this.failure) return Promise.reject(this.failure);
    const existing = this.pending.get(turnId);
    if (existing) return existing.promise;

    let resolveTurn: (turn: CodexTurnInfo) => void = () => undefined;
    let rejectTurn: (error: Error) => void = () => undefined;
    const promise = new Promise<CodexTurnInfo>((resolve, reject) => {
      resolveTurn = resolve;
      rejectTurn = reject;
    });
    const timer = setTimeout(() => {
      this.pending.delete(turnId);
      rejectTurn(new CodexTurnWaitTimeoutError(this.threadId, turnId, timeoutMs));
    }, timeoutMs);
    this.pending.set(turnId, { promise, resolve: resolveTurn, reject: rejectTurn, timer });
    return promise;
  }

  private recordMessage(turnId: string, message: CodexAgentMessage): void {
    let turnMessages = this.messages.get(turnId);
    if (!turnMessages) {
      turnMessages = new Map<string, CodexAgentMessage>();
      this.messages.set(turnId, turnMessages);
    }
    turnMessages.set(message.id, message);

    const completed = this.completed.get(turnId);
    if (completed) this.completed.set(turnId, this.mergeMessages(completed));
  }

  private complete(turn: CodexTurnInfo): void {
    const completed = this.mergeMessages(turn);
    this.completed.set(turn.id, completed);
    const pending = this.pending.get(turn.id);
    if (!pending) return;
    this.pending.delete(turn.id);
    clearTimeout(pending.timer);
    pending.resolve(completed);
  }

  private mergeMessages(turn: CodexTurnInfo): CodexTurnInfo {
    const buffered = this.messages.get(turn.id);
    if (!buffered || buffered.size === 0) return turn;

    const agentMessages = [...turn.agentMessages];
    const included = new Set(agentMessages.map((message) => message.id));
    for (const message of buffered.values()) {
      if (!included.has(message.id)) agentMessages.push(message);
    }
    return { ...turn, agentMessages };
  }
}
