import type { AnalysisRequest } from '../../prompt';
import { computeProviderStateKey, type ResultDeliveryMode } from '@/core/provenance';
import {
  matchesCodexAnalysisDeliveryTarget,
  type CodexAnalysisDeliveryTarget,
} from './analysis-delivery';
import { advanceCodexAnalysisSession, type CodexAnalysisSessionAdvance } from './session-advance';
import type { CodexRegistryUpdate } from './registry-update';
import {
  prepareCodexAnalysisSession,
  type CodexAnalysisSessionRuntime,
  type PreparedCodexAnalysisSession,
} from './session-preparation';
import type { CodexRuntimeConnection } from './runtime-selection';
import { cancelPreparedCodexAnalysisDelivery } from './thread-registry';
import type { CodexThreadRegistryV1, CodexThreadState } from './thread-state';

export interface CodexAnalysisRunRuntime extends Omit<CodexAnalysisSessionRuntime, 'connection'> {
  connection: CodexAnalysisSessionRuntime['connection'] & Pick<CodexRuntimeConnection, 'runTurn'>;
}

export interface RunCodexAnalysisOptions {
  username: string;
  registry: CodexThreadRegistryV1;
  runtime: CodexAnalysisRunRuntime;
  projectPath: string;
  request: AnalysisRequest;
  analysisFingerprint: string;
  payloadHash: string;
  basedOnPartial: boolean;
  deliveryMode: ResultDeliveryMode;
  timeoutMs: number;
  forceNew?: boolean;
  canReuseResult: (providerKey: string) => boolean;
  updateRegistry: CodexRegistryUpdate;
  createLocalSessionId?: () => string;
  createDeliveryId?: () => string;
  now?: () => Date;
  platform?: NodeJS.Platform;
}

interface CodexAnalysisRunBase {
  providerKey: string;
  registry: CodexThreadRegistryV1;
  state: CodexThreadState;
  model: string;
  reasoningEffort: string;
}

export type CodexAnalysisRunResult =
  | (CodexAnalysisRunBase & { status: 'skipped' })
  | (CodexAnalysisRunBase & { status: 'busy'; turnId: string | null })
  | (CodexAnalysisRunBase & {
      status: 'result';
      advance: Extract<CodexAnalysisSessionAdvance, { action: 'result' }>;
    });

function createProviderKey(
  request: AnalysisRequest,
  runtime: CodexAnalysisRunRuntime,
  state: CodexThreadState,
): string {
  return computeProviderStateKey({
    provider: 'codex',
    model: state.model,
    systemPrompt: request.systemPrompt,
    thinkingLevel: runtime.reasoningEffort,
    sessionKey: state.localSessionId,
  });
}

function createTarget(
  options: RunCodexAnalysisOptions,
  providerKey: string,
): CodexAnalysisDeliveryTarget {
  return {
    providerKey,
    analysisFingerprint: options.analysisFingerprint,
    payloadHash: options.payloadHash,
    basedOnPartial: options.basedOnPartial,
    deliveryMode: options.deliveryMode,
    reasoningEffort: options.runtime.reasoningEffort,
  };
}

function continuePreparedSession(
  advance: Extract<CodexAnalysisSessionAdvance, { action: 'continue' }>,
): PreparedCodexAnalysisSession {
  if (advance.state.bootstrapStatus === 'promptPending') {
    throw new Error(
      `Codex session "${advance.state.localSessionId}" remained prompt-pending after continuation`,
    );
  }
  return {
    action: advance.state.bootstrapStatus === 'analysisPending' ? 'sendAnalysis' : 'ready',
    source: advance.state.bootstrapStatus === 'analysisPending' ? 'pending' : 'active',
    registry: advance.registry,
    state: advance.state,
    thread: advance.thread,
  };
}

async function cancelSupersededUnacceptedDelivery(
  options: RunCodexAnalysisOptions,
  prepared: PreparedCodexAnalysisSession,
  target: CodexAnalysisDeliveryTarget,
): Promise<CodexThreadRegistryV1 | undefined> {
  if (prepared.state.bootstrapStatus !== 'ready') return undefined;
  const pending = prepared.state.pendingAnalysis;
  if (
    pending === undefined ||
    pending.turnId !== null ||
    matchesCodexAnalysisDeliveryTarget(pending, target)
  ) {
    return undefined;
  }

  const cancelledAt = (options.now ?? (() => new Date()))().toISOString();
  return options.updateRegistry((current) =>
    cancelPreparedCodexAnalysisDelivery(
      current,
      prepared.state.localSessionId,
      pending,
      cancelledAt,
    ),
  );
}

/**
 * Runs one complete Codex analysis exchange and returns result and delivery data for persistence.
 * @param options - Current analysis identity, runtime, request, registry, and persistence boundary.
 * @returns A reusable-result skip, busy state, or parsed result awaiting durable commit.
 * @throws When session preparation, recovery, delivery planning, or turn execution is inconsistent.
 */
export async function runCodexAnalysis(
  options: RunCodexAnalysisOptions,
): Promise<CodexAnalysisRunResult> {
  let prepared = await prepareCodexAnalysisSession({
    username: options.username,
    registry: options.registry,
    runtime: options.runtime,
    projectPath: options.projectPath,
    promptHash: options.request.promptHash,
    forceNew: options.forceNew,
    updateRegistry: options.updateRegistry,
    createLocalSessionId: options.createLocalSessionId,
    now: options.now,
    platform: options.platform,
  });
  const providerKey = createProviderKey(options.request, options.runtime, prepared.state);
  const target = createTarget(options, providerKey);
  const canReuseResult = options.canReuseResult(providerKey);

  for (let step = 0; step < 3; step += 1) {
    if (
      prepared.action === 'ready' &&
      prepared.state.pendingAnalysis === undefined &&
      canReuseResult
    ) {
      return {
        status: 'skipped',
        providerKey,
        registry: prepared.registry,
        state: prepared.state,
        model: prepared.state.model,
        reasoningEffort: options.runtime.reasoningEffort,
      };
    }

    if (prepared.action === 'sendAnalysis' && canReuseResult) {
      const registry = await cancelSupersededUnacceptedDelivery(options, prepared, target);
      if (registry) {
        const state = registry.sessions.find(
          (session) => session.localSessionId === prepared.state.localSessionId,
        );
        if (!state) {
          throw new Error(
            `Codex local session "${prepared.state.localSessionId}" was not found after cancellation`,
          );
        }
        return {
          status: 'skipped',
          providerKey,
          registry,
          state,
          model: state.model,
          reasoningEffort: options.runtime.reasoningEffort,
        };
      }
    }

    const advance = await advanceCodexAnalysisSession({
      prepared,
      target,
      systemPrompt: options.request.systemPrompt,
      payload: options.request.payload,
      timeoutMs: options.timeoutMs,
      connection: options.runtime.connection,
      updateRegistry: options.updateRegistry,
      createDeliveryId: options.createDeliveryId,
      now: options.now,
    });
    if (advance.action === 'busy') {
      return {
        status: 'busy',
        providerKey,
        registry: advance.registry,
        state: advance.state,
        model: advance.state.model,
        reasoningEffort: options.runtime.reasoningEffort,
        turnId: advance.turnId,
      };
    }
    if (advance.action === 'result') {
      return {
        status: 'result',
        providerKey,
        registry: advance.registry,
        state: advance.state,
        model: advance.state.model,
        reasoningEffort: options.runtime.reasoningEffort,
        advance,
      };
    }
    prepared = continuePreparedSession(advance);
  }

  throw new Error(`Codex session "${prepared.state.localSessionId}" did not reach a result`);
}
