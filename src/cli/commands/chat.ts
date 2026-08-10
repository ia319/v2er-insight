import {
  AI_PROVIDERS,
  THINKING_LEVELS,
  getConfig,
  resolveCodexConfig,
  resolveGeminiConfig,
  type AIProviderId,
  type ResolvedCodexConfig,
  type ResolvedGeminiConfig,
  type ThinkingLevel,
} from '@/config';
import { GeminiProvider, resolveApiKey } from '@/core/ai';
import {
  CodexChatTurnError,
  CodexTurnResultError,
  sendCodexChatTurn,
  selectCodexRuntime,
  type CodexThreadRegistryV1,
} from '@/core/ai/providers/codex';
import { discoverCodexExecutables } from '@/infra/codex';
import { logger } from '@/infra/logger';
import {
  AISessionLockBusyError,
  AISessionIndexLockBusyError,
  AISessionPersistError,
  AISessionStoreCorruptError,
  ChatSessionMissingError,
  CodexExecutionLockBusyError,
  completeGeminiChatSession,
  ensureCodexSessionRegistry,
  inspectCodexSessionStorage,
  readAISessionIndex,
  selectChatSession,
  updateCodexSessionRegistry,
  withAISessionLock,
  withCodexExecutionLock,
  type ChatSessionSelection,
} from '@/infra/storage';
import { getRecoveryActions } from '../workflow/recovery';
import type { ReasonCode, RecoveryAction, UserNotice } from '../workflow/types';
import { extractErrorDetails } from '../utils/error';

export interface ChatCommandOptions {
  provider?: string;
}

export interface ChatCommandResult {
  status: 'success' | 'failed';
  provider: AIProviderId | null;
  reasonCode?: ReasonCode;
  recoverActions?: RecoveryAction[];
  notices?: UserNotice[];
}

class ChatContextTooLongError extends Error {
  constructor() {
    super('The selected session exceeds the provider context limit');
    this.name = 'ChatContextTooLongError';
  }
}

function isProvider(value: string): value is AIProviderId {
  return AI_PROVIDERS.some((provider) => provider === value);
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return THINKING_LEVELS.some((level) => level === value);
}

function contextNotice(
  provider: AIProviderId,
  used: number,
  limit: number,
  source: 'sdk' | 'fallback',
): UserNotice {
  const unit = source === 'sdk' ? 'tokens' : 'UTF-8 bytes';
  return {
    code: 'SESSION_CONTEXT_NEAR_LIMIT',
    severity: 'warning',
    summary: `${provider} 会话上下文接近限制`,
    details: [`当前预检: ${used}/${limit} ${unit}`],
    actions: [
      {
        type: 'command',
        content: `v2er ai <username> --provider ${provider} --new-thread`,
        description: '准备好当前 analyzed 后，显式创建新的会话 generation',
      },
    ],
    documentation: 'docs/ai-conversations.md',
  };
}

function isGeminiContextError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = 'status' in error ? error.status : undefined;
  return (
    status === 400 &&
    /context window|input tokens?.*(?:limit|exceed|maximum)|input.*too (?:large|long)/i.test(
      error.message,
    )
  );
}

async function executeGeminiChat(
  username: string,
  selection: Extract<ChatSessionSelection, { provider: 'gemini' }>,
  message: string,
  config: ResolvedGeminiConfig,
): Promise<{ reply: string; notices: UserNotice[] }> {
  const persistedThinkingLevel = selection.session.thinkingLevel;
  if (persistedThinkingLevel !== null && !isThinkingLevel(persistedThinkingLevel)) {
    throw new AISessionStoreCorruptError();
  }
  const apiKey = resolveApiKey(config.apiKey);
  if (!apiKey) throw new Error('Gemini API Key 未配置');

  const provider = new GeminiProvider(apiKey, selection.session.model);
  const context = await provider.inspectContext(selection.session.systemInstruction, message, {
    history: selection.session.history,
    timeout: config.timeout,
  });
  if (context.tooLong) throw new ChatContextTooLongError();

  provider.createSession(selection.session.systemInstruction, {
    ...(persistedThinkingLevel === null ? {} : { thinkingLevel: persistedThinkingLevel }),
    history: selection.session.history,
    timeout: config.timeout,
  });
  let reply: string;
  try {
    reply = await provider.sendMessage(message);
  } catch (error) {
    if (isGeminiContextError(error)) throw new ChatContextTooLongError();
    throw error;
  }
  completeGeminiChatSession(username, selection, message, reply);
  return {
    reply,
    notices: context.nearLimit
      ? [contextNotice('gemini', context.used, context.limit, context.source)]
      : [],
  };
}

async function executeCodexChat(
  username: string,
  selection: Extract<ChatSessionSelection, { provider: 'codex' }>,
  message: string,
  config: ResolvedCodexConfig,
  proxyUrl?: string,
): Promise<{ reply: string; notices: UserNotice[] }> {
  const state = selection.session;
  const reasoningEffort = state.lastReasoningEffort ?? config.reasoningEffort;
  const discovery = discoverCodexExecutables(
    config.executable ? { explicitPath: config.executable } : {},
  );
  const runtime = await selectCodexRuntime(discovery.launchCandidates, {
    versionTimeoutMs: config.startupTimeout,
    process: {
      requestTimeoutMs: config.startupTimeout,
      shutdownGraceMs: config.shutdownGrace,
      ...(proxyUrl ? { proxyUrl } : {}),
    },
    connection: { startupTimeoutMs: config.startupTimeout },
    model: { model: state.model, reasoningEffort },
  });
  const registry = ensureCodexSessionRegistry(username);
  const updateRegistry = async (
    update: (current: CodexThreadRegistryV1) => CodexThreadRegistryV1,
  ): Promise<CodexThreadRegistryV1> => updateCodexSessionRegistry(username, update);

  try {
    const completed = await sendCodexChatTurn({
      registry,
      state,
      message,
      reasoningEffort: runtime.model.reasoningEffort,
      timeoutMs: config.turnTimeout,
      connection: runtime.connection,
      updateRegistry,
    });
    return { reply: completed.message.text, notices: [] };
  } finally {
    await runtime.connection.close().catch((error: unknown) => {
      const { message: errorMessage } = extractErrorDetails(error);
      logger.diagnostic('warn', `Codex chat runtime close failed: ${errorMessage}`);
    });
  }
}

function resolveChatProvider(
  username: string,
  requestedProvider: AIProviderId | undefined,
): AIProviderId {
  if (requestedProvider) return requestedProvider;
  const index = readAISessionIndex(username);
  if (index.status === 'valid') {
    const provider = index.index.lastSuccessfulAnalysisProvider;
    if (provider) return provider;
    throw new ChatSessionMissingError(null);
  }
  if (index.status === 'invalid') throw new AISessionStoreCorruptError();
  if (inspectCodexSessionStorage(username).migration === 'pending') return 'codex';
  throw new ChatSessionMissingError(null);
}

async function executeSelectedChat(
  username: string,
  message: string,
  provider: AIProviderId,
): Promise<{ provider: AIProviderId; reply: string; notices: UserNotice[] }> {
  const config = getConfig();
  const selected = selectChatSession(username, provider);
  return withAISessionLock(
    username,
    selected.provider,
    selected.session.localSessionId,
    async () => {
      const current = selectChatSession(username, provider);
      if (
        current.provider !== selected.provider ||
        current.session.localSessionId !== selected.session.localSessionId
      ) {
        throw new AISessionPersistError('The active chat session changed before execution');
      }
      const execution =
        current.provider === 'gemini'
          ? await executeGeminiChat(username, current, message, resolveGeminiConfig(config.ai))
          : await executeCodexChat(
              username,
              current,
              message,
              resolveCodexConfig(config.ai),
              config.proxy,
            );
      return { provider: current.provider, ...execution };
    },
  );
}

function classifyChatFailure(error: unknown): ReasonCode {
  if (error instanceof ChatSessionMissingError) return 'CHAT_SESSION_MISSING';
  if (
    error instanceof AISessionLockBusyError ||
    error instanceof AISessionIndexLockBusyError ||
    error instanceof CodexExecutionLockBusyError
  ) {
    return 'SESSION_BUSY';
  }
  if (error instanceof ChatContextTooLongError) return 'CHAT_CONTEXT_TOO_LONG';
  if (error instanceof CodexTurnResultError && error.codexErrorInfo === 'contextWindowExceeded') {
    return 'CHAT_CONTEXT_TOO_LONG';
  }
  if (error instanceof CodexChatTurnError && error.code === 'thread_busy') return 'SESSION_BUSY';
  if (error instanceof AISessionStoreCorruptError) return 'CHAT_SESSION_INVALID';
  if (error instanceof AISessionPersistError) return 'SESSION_PERSIST_FAILED';
  return 'CHAT_PROVIDER_FAILED';
}

/**
 * Sends one message to an existing provider session and writes only the final reply to stdout.
 * @param username - Owner of the selected persistent AI session.
 * @param message - Plain user message reconstructed from CLI arguments.
 * @param options - Optional explicit provider selection.
 * @returns Structured success or failure for exit handling and notices.
 */
export async function runChat(
  username: string,
  message: string,
  options: ChatCommandOptions,
): Promise<ChatCommandResult> {
  const requestedProvider = options.provider;
  if (requestedProvider !== undefined && !isProvider(requestedProvider)) {
    const reasonCode: ReasonCode = 'CHAT_SESSION_INVALID';
    logger.error(`无效的 chat provider: ${requestedProvider}`);
    return { status: 'failed', provider: null, reasonCode };
  }
  if (message.trim() === '') {
    const reasonCode: ReasonCode = 'CHAT_SESSION_INVALID';
    logger.error('聊天消息不能为空');
    return { status: 'failed', provider: requestedProvider ?? null, reasonCode };
  }

  let selectedProvider: AIProviderId | null = requestedProvider ?? null;
  try {
    const provider = resolveChatProvider(username, requestedProvider);
    selectedProvider = provider;
    const execute = async () => {
      if (provider === 'codex') {
        const storage = inspectCodexSessionStorage(username);
        if (storage.migration === 'pending') ensureCodexSessionRegistry(username);
      }
      return executeSelectedChat(username, message, provider);
    };
    const execution =
      provider === 'codex' ? await withCodexExecutionLock(username, execute) : await execute();
    process.stdout.write(`${execution.reply}\n`);
    return {
      status: 'success',
      provider: execution.provider,
      notices: execution.notices.length > 0 ? execution.notices : undefined,
    };
  } catch (error) {
    const reasonCode = classifyChatFailure(error);
    const { message: errorMessage } = extractErrorDetails(error);
    const recoverActions =
      reasonCode === 'CHAT_CONTEXT_TOO_LONG' && selectedProvider
        ? getRecoveryActions(reasonCode, { username, provider: selectedProvider })
        : [];
    logger.error(`[${reasonCode}] ${errorMessage}`);
    return {
      status: 'failed',
      provider: selectedProvider,
      reasonCode,
      ...(recoverActions.length > 0 ? { recoverActions } : {}),
      notices: undefined,
    };
  }
}
