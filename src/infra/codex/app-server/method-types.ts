export interface CodexServerInfo {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
}

export interface CodexAccountStatus {
  accountType: string | null;
  requiresOpenaiAuth: boolean;
}

export interface CodexReasoningEffortOption {
  reasoningEffort: string;
  description: string;
}

export interface CodexModelInfo {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  isDefault: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: CodexReasoningEffortOption[];
}

export interface CodexModelPage {
  data: CodexModelInfo[];
  nextCursor: string | null;
}
