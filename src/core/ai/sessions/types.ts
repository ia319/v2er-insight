import type { CodexThreadState } from '../providers/codex/thread-state';

export const AI_SESSION_INDEX_SCHEMA_VERSION = 1 as const;
export const AI_SESSION_STATE_SCHEMA_VERSION = 1 as const;

export type AISessionProvider = 'gemini' | 'codex';
export type AISessionStatus = 'promptPending' | 'analysisPending' | 'ready';

export interface AISessionSummary {
  localSessionId: string;
  provider: AISessionProvider;
  generation: number;
  status: AISessionStatus;
  model: string;
  promptHash: string;
  createdAt: string;
  lastUsedAt: string;
  externalThreadId: string | null;
}

export interface CodexSessionMigrationState {
  source: 'codex-sessions-v1';
  sourceHash: string;
  completedAt: string;
}

export interface AISessionIndexV1 {
  schemaVersion: typeof AI_SESSION_INDEX_SCHEMA_VERSION;
  lastSuccessfulAnalysisProvider: AISessionProvider | null;
  activeByProvider: Partial<Record<AISessionProvider, string>>;
  sessions: AISessionSummary[];
  migration?: CodexSessionMigrationState;
  updatedAt: string;
}

export interface BaseAISessionState {
  schemaVersion: typeof AI_SESSION_STATE_SCHEMA_VERSION;
  localSessionId: string;
  username: string;
  provider: AISessionProvider;
  generation: number;
  promptHash: string;
  model: string;
  createdAt: string;
  lastUsedAt: string;
  lastSuccessfulAnalysisAt: string | null;
  lastResultVersionId: string | null;
  lastAnalysisFingerprint: string | null;
}

export interface ProviderNeutralTextPart {
  text: string;
}

export interface ProviderNeutralMessage {
  role: 'user' | 'model';
  parts: ProviderNeutralTextPart[];
}

export interface GeminiSessionStateV1 extends BaseAISessionState {
  provider: 'gemini';
  systemInstruction: string;
  thinkingLevel: string | null;
  history: ProviderNeutralMessage[];
}

export type CodexSessionStateV1 = CodexThreadState &
  BaseAISessionState & {
    provider: 'codex';
    externalThreadId: string;
  };

export type AISessionStateV1 = GeminiSessionStateV1 | CodexSessionStateV1;
