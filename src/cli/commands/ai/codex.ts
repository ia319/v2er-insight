import { isAIAnalysisResult, type AIAnalysisResult, type AnalysisRequest } from '@/core/ai';
import {
  CODEX_THREAD_REGISTRY_SCHEMA_VERSION,
  activateCodexInitialAnalysisTurn,
  assertCodexProjectDirectory,
  completeCodexAnalysisUpdateTurn,
  resolveCodexProjectPath,
  runCodexAnalysis,
  selectCodexRuntime,
  selectCodexRuntimeModelRequest,
  type CodexThreadRegistryV1,
} from '@/core/ai/providers/codex';
import {
  hasProviderReceivedAnalysis,
  type AnalysisState,
  type AnalyzedProvenanceCheck,
  type ResultDeliveryMode,
} from '@/core/provenance';
import type { ResolvedCodexConfig } from '@/config';
import { discoverCodexExecutables } from '@/infra/codex';
import {
  CodexThreadRegistryCorruptError,
  readCodexThreadRegistry,
  updateCodexThreadRegistry,
} from '@/infra/storage';

type ValidAnalyzedProvenance = Extract<AnalyzedProvenanceCheck, { status: 'valid' }>;

export interface ExecuteCodexAnalysisOptions {
  username: string;
  config: ResolvedCodexConfig;
  request: AnalysisRequest;
  analysisState: AnalysisState;
  provenance: ValidAnalyzedProvenance;
  savedResult: unknown;
  model?: string;
  reasoningEffort?: string;
  codexProject?: string;
  proxyUrl?: string;
  newThread?: boolean;
  resend?: boolean;
}

interface CodexCommandExecutionBase {
  model: string;
  reasoningEffort: string;
  providerKey: string;
  localSessionId: string;
  threadId: string;
}

export type CodexCommandExecution =
  | (CodexCommandExecutionBase & { status: 'skipped' })
  | (CodexCommandExecutionBase & { status: 'busy'; turnId: string | null })
  | (CodexCommandExecutionBase & {
      status: 'result';
      result: AIAnalysisResult;
      delivery: {
        providerKey: string;
        analysisFingerprint: string;
        payloadHash: string;
        basedOnPartial: boolean;
        deliveryMode: ResultDeliveryMode;
      };
      complete: () => Promise<void>;
    });

function readRegistry(username: string): CodexThreadRegistryV1 {
  const result = readCodexThreadRegistry(username);
  if (result.status === 'invalid') throw new CodexThreadRegistryCorruptError();
  return result.status === 'valid'
    ? result.registry
    : {
        schemaVersion: CODEX_THREAD_REGISTRY_SCHEMA_VERSION,
        activeSessionId: null,
        sessions: [],
      };
}

function hasReusableResult(options: ExecuteCodexAnalysisOptions, providerKey: string): boolean {
  return (
    options.resend !== true &&
    hasProviderReceivedAnalysis(
      options.analysisState,
      providerKey,
      options.provenance.analysisFingerprint,
    ) &&
    options.analysisState.currentResult?.analysisFingerprint ===
      options.provenance.analysisFingerprint &&
    !options.analysisState.currentResult.stale &&
    isAIAnalysisResult(options.savedResult)
  );
}

/**
 * Executes the Codex provider boundary and returns result and delivery data for persistence.
 * @param options - Resolved provider settings, current request, provenance, and CLI overrides.
 * @returns A skip, busy state, or parsed result with a post-commit session completion callback.
 * @throws When the registry, Project, runtime, session, or turn cannot be validated.
 */
export async function executeCodexAnalysis(
  options: ExecuteCodexAnalysisOptions,
): Promise<CodexCommandExecution> {
  const registry = readRegistry(options.username);
  const project = resolveCodexProjectPath(options.codexProject, options.config.projectPath);
  assertCodexProjectDirectory(project.path);

  const configuredModel = options.model ?? options.config.model;
  const modelRequest = selectCodexRuntimeModelRequest(registry, {
    promptHash: options.request.promptHash,
    configuredModel,
    projectPath: project.path,
    forceNew: options.newThread,
  });
  const discovery = discoverCodexExecutables(
    options.config.executable ? { explicitPath: options.config.executable } : {},
  );
  const runtime = await selectCodexRuntime(discovery.launchCandidates, {
    versionTimeoutMs: options.config.startupTimeout,
    process: {
      requestTimeoutMs: options.config.startupTimeout,
      shutdownGraceMs: options.config.shutdownGrace,
      ...(options.proxyUrl ? { proxyUrl: options.proxyUrl } : {}),
    },
    connection: { startupTimeoutMs: options.config.startupTimeout },
    model: {
      model: modelRequest.model,
      reasoningEffort: options.reasoningEffort ?? options.config.reasoningEffort,
    },
  });
  const updateRegistry = async (
    update: (current: CodexThreadRegistryV1) => CodexThreadRegistryV1,
  ): Promise<CodexThreadRegistryV1> => updateCodexThreadRegistry(options.username, update);

  try {
    const execution = await runCodexAnalysis({
      username: options.username,
      registry,
      runtime: {
        executablePath: runtime.candidate.path,
        executableVersion: runtime.version,
        model: runtime.model.model,
        reasoningEffort: runtime.model.reasoningEffort,
        connection: runtime.connection,
      },
      projectPath: project.path,
      request: options.request,
      analysisFingerprint: options.provenance.analysisFingerprint,
      payloadHash: options.provenance.payloadHash,
      basedOnPartial: options.provenance.basedOnPartial,
      deliveryMode: options.resend ? 'resend' : 'change',
      timeoutMs: options.config.turnTimeout,
      forceNew: options.newThread,
      canReuseResult: (providerKey) => hasReusableResult(options, providerKey),
      updateRegistry,
    });
    const base: CodexCommandExecutionBase = {
      model: execution.model,
      reasoningEffort: execution.reasoningEffort,
      providerKey: execution.providerKey,
      localSessionId: execution.state.localSessionId,
      threadId: execution.state.threadId,
    };
    if (execution.status === 'skipped') return { ...base, status: 'skipped' };
    if (execution.status === 'busy') {
      return { ...base, status: 'busy', turnId: execution.turnId };
    }

    const { advance } = execution;
    return {
      ...base,
      status: 'result',
      result: advance.result,
      delivery: {
        providerKey: advance.delivery.providerKey,
        analysisFingerprint: advance.delivery.analysisFingerprint,
        payloadHash: advance.delivery.payloadHash,
        basedOnPartial: advance.delivery.basedOnPartial,
        deliveryMode: advance.delivery.deliveryMode,
      },
      complete: async () => {
        if (advance.completion === 'initial') {
          await activateCodexInitialAnalysisTurn({
            localSessionId: advance.state.localSessionId,
            turnId: advance.turn.id,
            reasoningEffort: advance.delivery.reasoningEffort,
            updateRegistry,
          });
          return;
        }
        await completeCodexAnalysisUpdateTurn({
          localSessionId: advance.state.localSessionId,
          turnId: advance.turn.id,
          reasoningEffort: advance.delivery.reasoningEffort,
          updateRegistry,
        });
      },
    };
  } finally {
    await runtime.connection.close();
  }
}
