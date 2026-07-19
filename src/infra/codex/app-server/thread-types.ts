export type CodexThreadActiveFlag = 'waitingOnApproval' | 'waitingOnUserInput';

export type CodexThreadStatus =
  | { type: 'notLoaded' | 'idle' | 'systemError' }
  | { type: 'active'; activeFlags: CodexThreadActiveFlag[] };

export type CodexTurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress';

export type CodexMessagePhase = 'commentary' | 'final_answer';

export interface CodexAgentMessage {
  id: string;
  text: string;
  phase: CodexMessagePhase | null;
}

export interface CodexTurnFailure {
  message: string;
  additionalDetails: string | null;
}

export interface CodexTurnInfo {
  id: string;
  status: CodexTurnStatus;
  error: CodexTurnFailure | null;
  agentMessages: CodexAgentMessage[];
}

export interface CodexThreadInfo {
  id: string;
  name: string | null;
  cwd: string;
  status: CodexThreadStatus;
  turns: CodexTurnInfo[];
}

export interface CodexThreadSessionInfo {
  thread: CodexThreadInfo;
  model: string;
  cwd: string;
  instructionSources: string[];
  reasoningEffort: string | null;
}
