import type { CodexThreadInfo } from '@/infra/codex';
import type { CodexBootstrapRecovery } from './bootstrap-recovery';
import { recoverCodexBootstrap } from './bootstrap-recovery';
import type { CodexRegistryUpdate } from './registry-update';
import type { CodexSessionCreationCause } from './session-selection';
import { selectCodexSession } from './session-selection';
import { createCodexThreadGeneration } from './thread-creation';
import { appendPendingCodexThreadState } from './thread-registry';
import { resumeCodexThread } from './thread-resume';
import type { CodexThreadRegistryV1, CodexThreadState } from './thread-state';
import type { CodexRuntimeConnection } from './runtime-selection';

export interface CodexAnalysisSessionRuntime {
  executablePath: string;
  executableVersion: string;
  model: string;
  reasoningEffort: string;
  connection: Pick<
    CodexRuntimeConnection,
    'startThread' | 'setThreadName' | 'resumeThread' | 'readThread'
  >;
}

export interface PrepareCodexAnalysisSessionOptions {
  username: string;
  registry: CodexThreadRegistryV1;
  runtime: CodexAnalysisSessionRuntime;
  projectPath: string;
  promptHash: string;
  forceNew?: boolean;
  updateRegistry: CodexRegistryUpdate;
  createLocalSessionId?: () => string;
  now?: () => Date;
  platform?: NodeJS.Platform;
}

export type PreparedCodexAnalysisSession =
  | {
      action: 'sendPrompt';
      source: 'created';
      creationCauses: CodexSessionCreationCause[];
      registry: CodexThreadRegistryV1;
      state: CodexThreadState;
      thread: CodexThreadInfo;
    }
  | (CodexBootstrapRecovery & {
      source: 'pending' | 'active';
      registry: CodexThreadRegistryV1;
    });

function withRegistry(
  recovery: CodexBootstrapRecovery,
  registry: CodexThreadRegistryV1,
  source: 'pending' | 'active',
): PreparedCodexAnalysisSession {
  return { ...recovery, registry, source };
}

/**
 * Creates or reconciles one Codex analysis session and selects its next safe action.
 * @param options - Session target, selected runtime, registry, and persistence boundary.
 * @returns A validated session and its next safe bootstrap or analysis action.
 * @throws When creation, resume identity, recovery state, or registry persistence is invalid.
 */
export async function prepareCodexAnalysisSession(
  options: PrepareCodexAnalysisSessionOptions,
): Promise<PreparedCodexAnalysisSession> {
  const selection = selectCodexSession(options.registry, {
    promptHash: options.promptHash,
    model: options.runtime.model,
    projectPath: options.projectPath,
    forceNew: options.forceNew,
    platform: options.platform,
  });

  if (selection.kind === 'create') {
    const created = await createCodexThreadGeneration({
      username: options.username,
      registry: options.registry,
      runtime: options.runtime,
      projectPath: options.projectPath,
      promptHash: options.promptHash,
      persistPending: (state) =>
        options.updateRegistry((current) => appendPendingCodexThreadState(current, state)),
      createLocalSessionId: options.createLocalSessionId,
      now: options.now,
      platform: options.platform,
    });
    return {
      action: 'sendPrompt',
      source: 'created',
      creationCauses: selection.causes,
      registry: created.registry,
      state: created.state,
      thread: created.session.thread,
    };
  }

  const resumed = await resumeCodexThread({
    state: selection.session,
    connection: options.runtime.connection,
    platform: options.platform,
  });
  let latestRegistry = options.registry;
  const recovery = await recoverCodexBootstrap({
    state: selection.session,
    thread: resumed.thread,
    updateRegistry: async (update) => {
      latestRegistry = await options.updateRegistry(update);
      return latestRegistry;
    },
    now: options.now,
    platform: options.platform,
  });
  return withRegistry(recovery, latestRegistry, selection.source);
}
