import type {
  CodexAgentMessage,
  CodexThreadStatus,
  CodexTurnFailure,
  CodexTurnInfo,
} from './thread-types';

export type CodexSessionNotification =
  | { kind: 'turnStarted'; threadId: string; turn: CodexTurnInfo }
  | { kind: 'turnCompleted'; threadId: string; turn: CodexTurnInfo }
  | {
      kind: 'itemCompleted';
      threadId: string;
      turnId: string;
      message: CodexAgentMessage | null;
    }
  | {
      kind: 'agentMessageDelta';
      threadId: string;
      turnId: string;
      itemId: string;
      delta: string;
    }
  | {
      kind: 'turnError';
      threadId: string;
      turnId: string;
      error: CodexTurnFailure;
      willRetry: boolean;
    }
  | { kind: 'threadStatusChanged'; threadId: string; status: CodexThreadStatus };
