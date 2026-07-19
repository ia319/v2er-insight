import { areCodexProjectPathsEqual } from './project-path';
import type { CodexThreadRegistryV1, CodexThreadState } from './thread-state';

export type CodexSessionCreationCause =
  | 'explicit_request'
  | 'no_ready_session'
  | 'prompt_changed'
  | 'model_changed'
  | 'project_changed';

export interface CodexSessionTarget {
  promptHash: string;
  model: string;
  projectPath: string;
  forceNew?: boolean;
  platform?: NodeJS.Platform;
}

export type CodexSessionSelection =
  | {
      kind: 'resume';
      source: 'pending' | 'active';
      session: CodexThreadState;
    }
  | {
      kind: 'create';
      causes: CodexSessionCreationCause[];
    };

function matchesTarget(session: CodexThreadState, target: CodexSessionTarget): boolean {
  return (
    session.promptHash === target.promptHash &&
    session.model === target.model &&
    areCodexProjectPathsEqual(
      session.projectPath,
      target.projectPath,
      target.platform ?? process.platform,
    )
  );
}

function findLatestCompatiblePendingSession(
  registry: CodexThreadRegistryV1,
  target: CodexSessionTarget,
): CodexThreadState | undefined {
  let latest: CodexThreadState | undefined;
  for (const session of registry.sessions) {
    if (
      session.bootstrapStatus !== 'ready' &&
      matchesTarget(session, target) &&
      (latest === undefined || session.generation > latest.generation)
    ) {
      latest = session;
    }
  }
  return latest;
}

function findActiveSession(registry: CodexThreadRegistryV1): CodexThreadState | undefined {
  if (registry.activeSessionId === null) return undefined;
  return registry.sessions.find(
    (session) =>
      session.localSessionId === registry.activeSessionId && session.bootstrapStatus === 'ready',
  );
}

/**
 * Selects a compatible persisted Codex session before any external operation.
 * @param registry - Validated per-user Codex session registry.
 * @param target - Prompt, model, Project, and explicit-generation requirements.
 * @returns A session to resume or the exact causes for creating a new generation.
 */
export function selectCodexSession(
  registry: CodexThreadRegistryV1,
  target: CodexSessionTarget,
): CodexSessionSelection {
  if (target.forceNew === true) {
    return { kind: 'create', causes: ['explicit_request'] };
  }

  const pending = findLatestCompatiblePendingSession(registry, target);
  if (pending) return { kind: 'resume', source: 'pending', session: pending };

  const active = findActiveSession(registry);
  if (!active) return { kind: 'create', causes: ['no_ready_session'] };
  if (matchesTarget(active, target)) {
    return { kind: 'resume', source: 'active', session: active };
  }

  const causes: CodexSessionCreationCause[] = [];
  if (active.promptHash !== target.promptHash) causes.push('prompt_changed');
  if (active.model !== target.model) causes.push('model_changed');
  if (
    !areCodexProjectPathsEqual(
      active.projectPath,
      target.projectPath,
      target.platform ?? process.platform,
    )
  ) {
    causes.push('project_changed');
  }
  return { kind: 'create', causes };
}
