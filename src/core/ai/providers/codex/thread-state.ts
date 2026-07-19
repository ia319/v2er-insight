export const CODEX_THREAD_STATE_SCHEMA_VERSION = 1 as const;
export const CODEX_THREAD_REGISTRY_SCHEMA_VERSION = 1 as const;

export type CodexBootstrapStatus = 'promptPending' | 'analysisPending' | 'ready';

export interface CodexThreadState {
  kind: 'codex';
  schemaVersion: typeof CODEX_THREAD_STATE_SCHEMA_VERSION;
  localSessionId: string;
  threadId: string;
  generation: number;
  displayName: string;
  promptHash: string;
  bootstrapStatus: CodexBootstrapStatus;
  promptTurnId: string | null;
  initialAnalysisTurnId: string | null;
  lastTurnId: string | null;
  model: string;
  lastReasoningEffort: string | null;
  executablePath: string;
  executableVersion: string;
  projectPath: string;
  instructionSources: string[];
  createdAt: string;
  lastUsedAt: string;
}

export interface CodexThreadRegistryV1 {
  schemaVersion: typeof CODEX_THREAD_REGISTRY_SCHEMA_VERSION;
  activeSessionId: string | null;
  sessions: CodexThreadState[];
}
