import type {
  CodexProjectPathErrorCode,
  CodexProjectPathSource,
  CodexRuntimeAttempt,
  CodexThreadState,
} from '@/core/ai/providers/codex';
import type { CodexExecutableCandidate, CodexThreadInfo } from '@/infra/codex';

export type CodexDiagnosticSeverity = 'warning' | 'error';

export interface CodexDiagnosticIssue {
  code: string;
  severity: CodexDiagnosticSeverity;
  message: string;
}

export type CodexCandidateVersion =
  | { status: 'available'; version: string }
  | { status: 'unavailable'; message: string };

export interface CodexCandidateDiagnostic {
  candidate: CodexExecutableCandidate;
  version: CodexCandidateVersion;
  selection: 'selected' | 'rejected' | 'not_checked';
  attemptCode?: CodexRuntimeAttempt['code'];
}

export type CodexProjectDiagnostic =
  | { status: 'available'; path: string; source: CodexProjectPathSource }
  | {
      status: 'unavailable';
      path: string | null;
      source: CodexProjectPathSource | null;
      code: CodexProjectPathErrorCode;
    };

export interface CodexModelDiagnostic {
  model: string;
  displayName: string;
  isDefault: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: string[];
}

export interface CodexRuntimeDiagnostic {
  executablePath: string;
  executableSource: CodexExecutableCandidate['source'];
  version: string;
  userAgent: string;
  codexHome: string;
  accountType: string | null;
  requiresOpenaiAuth: boolean;
  modelSelection: 'configured' | 'fallback';
  requestedModel: string;
  requestedReasoningEffort: string;
  selectedModel: string;
  selectedReasoningEffort: string;
  models: CodexModelDiagnostic[];
}

export interface CodexRegistrySessionDiagnostic {
  localSessionId: string;
  threadId: string;
  generation: number;
  displayName: string;
  bootstrapStatus: CodexThreadState['bootstrapStatus'];
  model: string;
  projectPath: string;
  lastTurnId: string | null;
  hasPendingAnalysis: boolean;
}

export type CodexRegistryDiagnostic =
  | { status: 'not_requested' }
  | { status: 'missing' | 'invalid' }
  | {
      status: 'valid';
      activeSessionId: string | null;
      sessions: CodexRegistrySessionDiagnostic[];
    };

export type CodexLockDiagnostic =
  | { status: 'not_requested' | 'missing' | 'invalid' }
  | { status: 'locked'; pid: number; acquiredAt: string };

export interface CodexThreadDiagnostic {
  localSessionId: string;
  threadId: string;
  name: string | null;
  cwd: string;
  status: CodexThreadInfo['status'];
  lastTurnId: string | null;
  lastTurnStatus: CodexThreadInfo['turns'][number]['status'] | null;
  projectMatchesRegistry: boolean;
}

export interface CodexSessionCheckReport {
  appDetected: boolean;
  candidates: CodexCandidateDiagnostic[];
  project: CodexProjectDiagnostic;
  runtime: CodexRuntimeDiagnostic | null;
  registry: CodexRegistryDiagnostic;
  lock: CodexLockDiagnostic;
  thread: CodexThreadDiagnostic | null;
  issues: CodexDiagnosticIssue[];
}
