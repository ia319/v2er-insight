import {
  CODEX_DEFAULT_MODEL,
  CODEX_DEFAULT_REASONING_EFFORT,
  type ResolvedCodexConfig,
} from '@/config';
import {
  areCodexProjectPathsEqual,
  assertCodexProjectDirectory,
  CodexProjectPathError,
  CodexRuntimeSelectionError,
  resolveCodexProjectPath,
  selectCodexRuntime,
  type CodexRuntimeAttempt,
  type CodexRuntimeSelectionOptions,
  type CodexThreadState,
  type SelectedCodexRuntime,
} from '@/core/ai/providers/codex';
import {
  connectCodexAppServer,
  discoverCodexExecutables,
  probeCodexCliVersion,
  type CodexExecutableCandidate,
  type CodexExecutableDiscovery,
  type CodexExecutableObservation,
  type CodexModelInfo,
} from '@/infra/codex';
import {
  readCodexExecutionLock,
  readCodexThreadRegistry,
  type CodexExecutionLockState,
} from '@/infra/storage';
import type {
  CodexCandidateDiagnostic,
  CodexCandidateVersion,
  CodexDiagnosticIssue,
  CodexLockDiagnostic,
  CodexModelDiagnostic,
  CodexProjectDiagnostic,
  CodexRegistryDiagnostic,
  CodexRegistrySessionDiagnostic,
  CodexSessionCheckReport,
  CodexThreadDiagnostic,
} from './codex-types';

type VersionProbe = (candidate: CodexExecutableCandidate, timeoutMs: number) => Promise<string>;

export interface CodexSessionCheckDependencies {
  discover(config: ResolvedCodexConfig): CodexExecutableDiscovery;
  probeVersion: VersionProbe;
  selectRuntime(
    candidates: readonly CodexExecutableCandidate[],
    options: CodexRuntimeSelectionOptions,
    probeVersion: VersionProbe,
  ): Promise<SelectedCodexRuntime>;
  readRegistry: typeof readCodexThreadRegistry;
  readLock: typeof readCodexExecutionLock;
  resolveProject: typeof resolveCodexProjectPath;
  assertProject: typeof assertCodexProjectDirectory;
}

const DEFAULT_DEPENDENCIES: CodexSessionCheckDependencies = {
  discover: (config) =>
    discoverCodexExecutables(config.executable ? { explicitPath: config.executable } : {}),
  probeVersion: probeCodexCliVersion,
  selectRuntime: (candidates, options, probeVersion) =>
    selectCodexRuntime(candidates, options, {
      probeVersion,
      connect: connectCodexAppServer,
    }),
  readRegistry: readCodexThreadRegistry,
  readLock: readCodexExecutionLock,
  resolveProject: (_cliPath, configPath) => resolveCodexProjectPath(undefined, configPath),
  assertProject: assertCodexProjectDirectory,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function inspectCandidateVersions(
  candidates: readonly CodexExecutableCandidate[],
  timeoutMs: number,
  probeVersion: VersionProbe,
): Promise<Map<CodexExecutableCandidate, CodexCandidateVersion>> {
  const reports = await Promise.all(
    candidates.map(
      async (candidate): Promise<readonly [CodexExecutableCandidate, CodexCandidateVersion]> => {
        try {
          return [
            candidate,
            { status: 'available', version: await probeVersion(candidate, timeoutMs) },
          ];
        } catch (error) {
          return [candidate, { status: 'unavailable', message: errorMessage(error) }];
        }
      },
    ),
  );
  return new Map(reports);
}

function resolveProjectDiagnostic(
  config: ResolvedCodexConfig,
  dependencies: CodexSessionCheckDependencies,
): { project: CodexProjectDiagnostic; issue?: CodexDiagnosticIssue } {
  try {
    const project = dependencies.resolveProject(undefined, config.projectPath);
    try {
      dependencies.assertProject(project.path);
      return { project: { status: 'available', ...project } };
    } catch (error) {
      const code = error instanceof CodexProjectPathError ? error.code : 'unavailable';
      return {
        project: { status: 'unavailable', ...project, code },
        issue: { code: `project_${code}`, severity: 'error', message: errorMessage(error) },
      };
    }
  } catch (error) {
    const code = error instanceof CodexProjectPathError ? error.code : 'unavailable';
    return {
      project: { status: 'unavailable', path: null, source: null, code },
      issue: { code: `project_${code}`, severity: 'error', message: errorMessage(error) },
    };
  }
}

function mapLockState(state: CodexExecutionLockState): CodexLockDiagnostic {
  return state.status === 'locked'
    ? { status: 'locked', pid: state.owner.pid, acquiredAt: state.owner.acquiredAt }
    : state;
}

function mapRegistrySession(session: CodexThreadState): CodexRegistrySessionDiagnostic {
  return {
    localSessionId: session.localSessionId,
    threadId: session.threadId,
    generation: session.generation,
    displayName: session.displayName,
    bootstrapStatus: session.bootstrapStatus,
    model: session.model,
    projectPath: session.projectPath,
    lastTurnId: session.lastTurnId,
    hasPendingAnalysis: session.pendingAnalysis !== undefined,
  };
}

function selectDiagnosticSession(
  sessions: readonly CodexThreadState[],
  activeId: string | null,
): CodexThreadState | null {
  const active = sessions.find((session) => session.localSessionId === activeId);
  if (active) return active;
  return sessions.reduce<CodexThreadState | null>(
    (latest, session) =>
      latest === null || session.generation > latest.generation ? session : latest,
    null,
  );
}

function mapModels(models: readonly CodexModelInfo[]): CodexModelDiagnostic[] {
  return models.map((model) => ({
    model: model.model,
    displayName: model.displayName,
    isDefault: model.isDefault,
    defaultReasoningEffort: model.defaultReasoningEffort,
    supportedReasoningEfforts: model.supportedReasoningEfforts.map(
      (option) => option.reasoningEffort,
    ),
  }));
}

function mergeCandidateDiagnostics(
  observations: readonly CodexExecutableObservation[],
  versions: ReadonlyMap<CodexExecutableCandidate, CodexCandidateVersion>,
  selected: CodexExecutableCandidate | null,
  attempts: readonly CodexRuntimeAttempt[],
): CodexCandidateDiagnostic[] {
  return observations.map(({ candidate, trust }) => {
    const attempt = attempts.find((item) => item.candidate === candidate);
    return {
      candidate,
      trust,
      version: versions.get(candidate) ?? { status: 'not_checked' },
      selection:
        candidate === selected ? 'selected' : attempt === undefined ? 'not_checked' : 'rejected',
      ...(attempt ? { attemptCode: attempt.code } : {}),
      ...(attempt?.modelErrorCode ? { modelErrorCode: attempt.modelErrorCode } : {}),
    };
  });
}

/**
 * Collects a read-only Codex runtime, Project, registry, lock, and thread diagnostic report.
 * @param username - Optional V2EX user whose local session and thread state are inspected.
 * @param config - Resolved Codex provider configuration.
 * @param dependencies - Injectable local runtime and storage boundaries.
 * @returns A structured report with explicit issues and no message payloads or credentials.
 */
export async function checkCodexSession(
  username: string | undefined,
  config: ResolvedCodexConfig,
  dependencies: CodexSessionCheckDependencies = DEFAULT_DEPENDENCIES,
): Promise<CodexSessionCheckReport> {
  const issues: CodexDiagnosticIssue[] = [];
  const projectResult = resolveProjectDiagnostic(config, dependencies);
  if (projectResult.issue) issues.push(projectResult.issue);

  const registryRead = username ? dependencies.readRegistry(username) : null;
  const registry: CodexRegistryDiagnostic =
    registryRead === null
      ? { status: 'not_requested' }
      : registryRead.status === 'valid'
        ? {
            status: 'valid',
            activeSessionId: registryRead.registry.activeSessionId,
            sessions: registryRead.registry.sessions.map(mapRegistrySession),
          }
        : registryRead;
  if (registry.status === 'invalid') {
    issues.push({
      code: 'registry_invalid',
      severity: 'error',
      message: 'codex-sessions.json is invalid or unreadable',
    });
  }

  const lock = username
    ? mapLockState(dependencies.readLock(username))
    : { status: 'not_requested' as const };
  if (lock.status === 'invalid') {
    issues.push({
      code: 'lock_invalid',
      severity: 'error',
      message: 'Codex execution lock is invalid or unreadable',
    });
  } else if (lock.status === 'locked') {
    issues.push({
      code: 'lock_held',
      severity: 'warning',
      message: `Codex execution lock is held by process ${lock.pid}`,
    });
  }

  const discovery = dependencies.discover(config);
  const candidates = discovery.launchCandidates;
  const versions = await inspectCandidateVersions(
    candidates,
    config.startupTimeout,
    dependencies.probeVersion,
  );
  const cachedProbe: VersionProbe = async (candidate) => {
    const report = versions.get(candidate);
    if (!report || report.status !== 'available') {
      throw new Error(
        report?.status === 'unavailable' ? report.message : 'Version probe result is unavailable',
      );
    }
    return report.version;
  };
  const selectionOptions: CodexRuntimeSelectionOptions = {
    versionTimeoutMs: config.startupTimeout,
    process: {
      requestTimeoutMs: config.startupTimeout,
      shutdownGraceMs: config.shutdownGrace,
    },
    connection: { startupTimeoutMs: config.startupTimeout },
    model: { model: config.model, reasoningEffort: config.reasoningEffort },
  };

  let selected: SelectedCodexRuntime | null = null;
  let attempts: readonly CodexRuntimeAttempt[] = [];
  let modelSelection: 'configured' | 'fallback' = 'configured';
  let thread: CodexThreadDiagnostic | null = null;
  try {
    selected = await dependencies.selectRuntime(candidates, selectionOptions, cachedProbe);
    attempts = selected.attempts;
  } catch (error) {
    if (error instanceof CodexRuntimeSelectionError) attempts = error.attempts;
    const modelFailure = attempts.find((attempt) => attempt.code === 'model_invalid');
    if (modelFailure) {
      issues.push({
        code: 'model_configuration_invalid',
        severity: 'error',
        message: modelFailure.message,
      });
      try {
        selected = await dependencies.selectRuntime(
          candidates,
          {
            ...selectionOptions,
            model: {
              model: CODEX_DEFAULT_MODEL,
              reasoningEffort: CODEX_DEFAULT_REASONING_EFFORT,
            },
          },
          cachedProbe,
        );
        modelSelection = 'fallback';
      } catch (fallbackError) {
        issues.push({
          code: 'runtime_unavailable',
          severity: 'error',
          message: errorMessage(fallbackError),
        });
      }
    } else {
      issues.push({
        code: 'runtime_unavailable',
        severity: 'error',
        message: errorMessage(error),
      });
    }
  }

  if (selected) {
    const target =
      registryRead?.status === 'valid'
        ? selectDiagnosticSession(
            registryRead.registry.sessions,
            registryRead.registry.activeSessionId,
          )
        : null;
    if (target) {
      try {
        const external = await selected.connection.readThread(target.threadId);
        const lastTurn = external.turns[external.turns.length - 1];
        const projectMatchesRegistry = areCodexProjectPathsEqual(target.projectPath, external.cwd);
        thread = {
          localSessionId: target.localSessionId,
          threadId: external.id,
          name: external.name,
          cwd: external.cwd,
          status: external.status,
          lastTurnId: lastTurn?.id ?? null,
          lastTurnStatus: lastTurn?.status ?? null,
          projectMatchesRegistry,
        };
        if (external.id !== target.threadId || !projectMatchesRegistry) {
          issues.push({
            code: 'thread_identity_mismatch',
            severity: 'error',
            message: 'Persisted Codex thread identity does not match the external thread',
          });
        }
      } catch (error) {
        issues.push({
          code: 'thread_unavailable',
          severity: 'error',
          message: errorMessage(error),
        });
      }
    }
  }

  await selected?.connection.close().catch((error: unknown) => {
    issues.push({
      code: 'runtime_close_failed',
      severity: 'warning',
      message: errorMessage(error),
    });
  });

  return {
    appDetected: discovery.observations.some(
      ({ candidate }) =>
        candidate.source === 'running-app-server' || candidate.source === 'app-bundle',
    ),
    candidates: mergeCandidateDiagnostics(
      discovery.observations,
      versions,
      selected?.candidate ?? null,
      attempts,
    ),
    project: projectResult.project,
    runtime:
      selected === null
        ? null
        : {
            executablePath: selected.candidate.path,
            executableSource: selected.candidate.source,
            version: selected.version,
            userAgent: selected.server.userAgent,
            codexHome: selected.server.codexHome,
            accountType: selected.account.accountType,
            requiresOpenaiAuth: selected.account.requiresOpenaiAuth,
            modelSelection,
            requestedModel: config.model,
            requestedReasoningEffort: config.reasoningEffort,
            selectedModel: selected.model.model,
            selectedReasoningEffort: selected.model.reasoningEffort,
            models: mapModels(selected.models),
          },
    registry,
    lock,
    thread,
    issues,
  };
}
