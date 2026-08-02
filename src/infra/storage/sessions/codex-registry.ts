import { isDeepStrictEqual } from 'node:util';
import { createAISessionSummary, sortAISessionSummaries } from '@/core/ai/sessions/summary';
import {
  AI_SESSION_INDEX_SCHEMA_VERSION,
  type AISessionIndexV1,
  type CodexSessionStateV1,
} from '@/core/ai/sessions/types';
import { isCodexSessionStateV1 } from '@/core/ai/sessions/validator';
import type {
  CodexThreadRegistryV1,
  CodexThreadState,
} from '@/core/ai/providers/codex/thread-state';
import { CODEX_THREAD_REGISTRY_SCHEMA_VERSION } from '@/core/ai/providers/codex/thread-state';
import { isCodexThreadRegistryV1 } from '@/core/ai/providers/codex/thread-state-validator';
import { hashCanonicalJson } from '@/core/provenance/canonical-json';
import { readAnalysisState } from '../analysis-state';
import { CodexThreadRegistryCorruptError, readCodexThreadRegistry } from '../codex-thread-registry';
import { readStoredResultVersion } from '../result-version-files';
import { AISessionStoreCorruptError } from './errors';
import {
  readAISessionState,
  readAISessionStore,
  writeAISessionIndex,
  writeAISessionState,
} from './repository';

/** Reports new and legacy session data that cannot be reconciled automatically. */
export class AISessionMigrationConflictError extends Error {
  constructor(identity: string) {
    super(`AI session migration conflicts with "${identity}"`);
    this.name = 'AISessionMigrationConflictError';
  }
}

/** Reports a legacy migration write failure while retaining the original error. */
export class AISessionMigrationFailedError extends Error {
  readonly migrationCause: unknown;

  constructor(cause: unknown) {
    super('AI session migration could not be completed');
    this.name = 'AISessionMigrationFailedError';
    this.migrationCause = cause;
  }
}

interface LoadedCodexSessionStore {
  index: AISessionIndexV1;
  sessions: CodexSessionStateV1[];
  registry: CodexThreadRegistryV1;
}

export type CodexSessionStorageStatus = 'missing' | 'invalid' | 'valid';
export type CodexSessionMigrationStatus = 'not_required' | 'pending' | 'complete' | 'conflict';
export type CodexSessionRegistryProjectionResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; registry: CodexThreadRegistryV1 };

export interface CodexSessionStorageInspection {
  sessions: CodexSessionStorageStatus;
  legacy: CodexSessionStorageStatus;
  migration: CodexSessionMigrationStatus;
  registry: CodexSessionRegistryProjectionResult;
}

function maxTimestamp(...timestamps: string[]): string {
  return timestamps.reduce((latest, timestamp) => (timestamp > latest ? timestamp : latest));
}

function emptyRegistry(): CodexThreadRegistryV1 {
  return {
    schemaVersion: CODEX_THREAD_REGISTRY_SCHEMA_VERSION,
    activeSessionId: null,
    sessions: [],
  };
}

function createEmptyIndex(updatedAt: string): AISessionIndexV1 {
  return {
    schemaVersion: AI_SESSION_INDEX_SCHEMA_VERSION,
    lastSuccessfulAnalysisProvider: null,
    activeByProvider: {},
    sessions: [],
    updatedAt,
  };
}

function toThreadState(session: CodexSessionStateV1): CodexThreadState {
  return {
    kind: session.kind,
    schemaVersion: session.schemaVersion,
    localSessionId: session.localSessionId,
    threadId: session.threadId,
    generation: session.generation,
    displayName: session.displayName,
    promptHash: session.promptHash,
    bootstrapStatus: session.bootstrapStatus,
    promptTurnId: session.promptTurnId,
    initialAnalysisTurnId: session.initialAnalysisTurnId,
    lastTurnId: session.lastTurnId,
    ...(session.pendingAnalysis ? { pendingAnalysis: session.pendingAnalysis } : {}),
    model: session.model,
    lastReasoningEffort: session.lastReasoningEffort,
    executablePath: session.executablePath,
    executableVersion: session.executableVersion,
    projectPath: session.projectPath,
    instructionSources: [...session.instructionSources],
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
  };
}

function toRegistry(
  index: AISessionIndexV1,
  sessions: CodexSessionStateV1[],
): CodexThreadRegistryV1 {
  const registry: CodexThreadRegistryV1 = {
    schemaVersion: CODEX_THREAD_REGISTRY_SCHEMA_VERSION,
    activeSessionId: index.activeByProvider.codex ?? null,
    sessions: sessions.map(toThreadState),
  };
  if (!isCodexThreadRegistryV1(registry)) throw new AISessionStoreCorruptError();
  return registry;
}

function loadCodexSessionStore(username: string): LoadedCodexSessionStore | null {
  const result = readAISessionStore(username);
  if (result.status === 'missing') return null;
  if (result.status === 'invalid') throw new AISessionStoreCorruptError();

  const sessions = result.sessions.filter(
    (session): session is CodexSessionStateV1 => session.provider === 'codex',
  );
  return { index: result.index, sessions, registry: toRegistry(result.index, sessions) };
}

/**
 * Inspects new and legacy Codex session storage without writing or migrating either source.
 * @param username - Owner of the Codex session data.
 * @returns Storage states, migration status, and an unambiguous registry projection when available.
 */
export function inspectCodexSessionStorage(username: string): CodexSessionStorageInspection {
  const store = readAISessionStore(username);
  const legacy = readCodexThreadRegistry(username);

  if (store.status === 'invalid') {
    return {
      sessions: 'invalid',
      legacy: legacy.status,
      migration: 'conflict',
      registry: { status: 'invalid' },
    };
  }
  if (store.status === 'missing') {
    return {
      sessions: 'missing',
      legacy: legacy.status,
      migration:
        legacy.status === 'valid'
          ? 'pending'
          : legacy.status === 'invalid'
            ? 'conflict'
            : 'not_required',
      registry: legacy,
    };
  }

  const registry = toRegistry(
    store.index,
    store.sessions.filter(
      (session): session is CodexSessionStateV1 => session.provider === 'codex',
    ),
  );
  if (legacy.status === 'valid') {
    const marker = store.index.migration;
    if (!marker || marker.sourceHash !== hashCanonicalJson(legacy.registry)) {
      return {
        sessions: 'valid',
        legacy: 'valid',
        migration: 'conflict',
        registry: { status: 'invalid' },
      };
    }
  }

  return {
    sessions: 'valid',
    legacy: legacy.status,
    migration: store.index.migration ? 'complete' : 'not_required',
    registry: { status: 'valid', registry },
  };
}

interface LegacyAnalysisReference {
  lastSuccessfulAnalysisAt: string;
  lastResultVersionId: string;
  lastAnalysisFingerprint: string;
}

function readLegacyAnalysisReference(
  username: string,
  session: CodexThreadState,
): LegacyAnalysisReference | null {
  const analysisState = readAnalysisState(username);
  if (analysisState.status !== 'valid') return null;
  const current = analysisState.state.currentResult;
  if (!current?.resultVersionId) return null;

  const stored = readStoredResultVersion(username, current.resultVersionId);
  if (stored.status !== 'valid') return null;
  const metadata = stored.version.metadata;
  if (
    metadata.provider !== 'codex' ||
    metadata.localSessionId !== session.localSessionId ||
    metadata.externalThreadId !== session.threadId ||
    metadata.promptHash !== session.promptHash ||
    metadata.analysisFingerprint !== current.analysisFingerprint
  ) {
    return null;
  }

  return {
    lastSuccessfulAnalysisAt: metadata.createdAt ?? metadata.savedAt,
    lastResultVersionId: metadata.versionId,
    lastAnalysisFingerprint: current.analysisFingerprint,
  };
}

function migrateLegacySession(username: string, session: CodexThreadState): CodexSessionStateV1 {
  const reference = readLegacyAnalysisReference(username, session);
  const migrated: CodexSessionStateV1 = {
    ...session,
    username,
    provider: 'codex',
    externalThreadId: session.threadId,
    lastSuccessfulAnalysisAt: reference?.lastSuccessfulAnalysisAt ?? null,
    lastResultVersionId: reference?.lastResultVersionId ?? null,
    lastAnalysisFingerprint: reference?.lastAnalysisFingerprint ?? null,
    lastUsedAt:
      reference === null
        ? session.lastUsedAt
        : maxTimestamp(session.lastUsedAt, reference.lastSuccessfulAnalysisAt),
  };
  if (!isCodexSessionStateV1(migrated)) throw new CodexThreadRegistryCorruptError();
  return migrated;
}

function migrateLegacyRegistry(
  username: string,
  registry: CodexThreadRegistryV1,
  now: string,
): LoadedCodexSessionStore {
  const sourceHash = hashCanonicalJson(registry);
  const sessions = registry.sessions.map((session) => migrateLegacySession(username, session));

  for (const session of sessions) {
    const existing = readAISessionState(username, 'codex', session.localSessionId);
    if (existing.status === 'invalid') {
      throw new AISessionMigrationConflictError(session.localSessionId);
    }
    if (existing.status === 'valid') {
      if (!isDeepStrictEqual(existing.session, session)) {
        throw new AISessionMigrationConflictError(session.localSessionId);
      }
      continue;
    }
    writeAISessionState(username, session);
  }

  const summaries = sortAISessionSummaries(sessions.map(createAISessionSummary));
  const hasReadyActiveSession = sessions.some(
    (session) =>
      session.localSessionId === registry.activeSessionId && session.bootstrapStatus === 'ready',
  );
  const index: AISessionIndexV1 = {
    schemaVersion: AI_SESSION_INDEX_SCHEMA_VERSION,
    lastSuccessfulAnalysisProvider: hasReadyActiveSession ? 'codex' : null,
    activeByProvider: registry.activeSessionId === null ? {} : { codex: registry.activeSessionId },
    sessions: summaries,
    migration: { source: 'codex-sessions-v1', sourceHash, completedAt: now },
    updatedAt: maxTimestamp(now, ...summaries.map((summary) => summary.lastUsedAt)),
  };
  writeAISessionIndex(username, index);
  return { index, sessions, registry: toRegistry(index, sessions) };
}

/**
 * Opens the writable Codex session store and migrates a valid legacy registry when required.
 * Call this function only while the per-user Codex execution lock is held.
 * @param username - Owner of the Codex session store.
 * @param now - Clock used for migration and empty-index timestamps.
 * @returns A validated Codex registry projection.
 * @throws When session data is invalid, migration identities conflict, or migration cannot finish.
 */
export function ensureCodexSessionRegistry(
  username: string,
  now: () => Date = () => new Date(),
): CodexThreadRegistryV1 {
  const existing = loadCodexSessionStore(username);
  if (existing) {
    const legacy = readCodexThreadRegistry(username);
    if (legacy.status === 'valid') {
      const marker = existing.index.migration;
      if (!marker || marker.sourceHash !== hashCanonicalJson(legacy.registry)) {
        throw new AISessionMigrationConflictError('sessions/index.json');
      }
    }
    return existing.registry;
  }

  const legacy = readCodexThreadRegistry(username);
  if (legacy.status === 'invalid') throw new CodexThreadRegistryCorruptError();
  const timestamp = now().toISOString();
  if (legacy.status === 'valid') {
    try {
      return migrateLegacyRegistry(username, legacy.registry, timestamp).registry;
    } catch (error) {
      if (
        error instanceof AISessionMigrationConflictError ||
        error instanceof CodexThreadRegistryCorruptError
      ) {
        throw error;
      }
      throw new AISessionMigrationFailedError(error);
    }
  }

  const index = createEmptyIndex(timestamp);
  writeAISessionIndex(username, index);
  return emptyRegistry();
}

function mergeCodexState(
  username: string,
  state: CodexThreadState,
  previous: CodexSessionStateV1 | undefined,
): CodexSessionStateV1 {
  const next: CodexSessionStateV1 = {
    ...previous,
    ...state,
    username,
    provider: 'codex',
    externalThreadId: state.threadId,
    lastSuccessfulAnalysisAt: previous?.lastSuccessfulAnalysisAt ?? null,
    lastResultVersionId: previous?.lastResultVersionId ?? null,
    lastAnalysisFingerprint: previous?.lastAnalysisFingerprint ?? null,
  };
  if (!isCodexSessionStateV1(next)) {
    throw new TypeError('Codex session update produced invalid persisted state');
  }
  return next;
}

/**
 * Applies one legacy registry transition to provider files and publishes the index last.
 * Call this function only while the per-user Codex execution lock is held.
 * @param username - Owner of the Codex session store.
 * @param update - Validated Codex registry transition.
 * @param now - Clock used for the index update timestamp.
 * @returns The updated Codex registry projection.
 * @throws When current state or updater output is invalid, or persistence fails.
 */
export function updateCodexSessionRegistry(
  username: string,
  update: (registry: CodexThreadRegistryV1) => CodexThreadRegistryV1,
  now: () => Date = () => new Date(),
): CodexThreadRegistryV1 {
  ensureCodexSessionRegistry(username, now);
  const current = loadCodexSessionStore(username);
  if (!current) throw new AISessionStoreCorruptError();

  const nextRegistry = update(current.registry);
  if (!isCodexThreadRegistryV1(nextRegistry)) {
    throw new TypeError('Codex session registry update produced invalid state');
  }

  const previousById = new Map(
    current.sessions.map((session) => [session.localSessionId, session] as const),
  );
  const nextSessions = nextRegistry.sessions.map((state) =>
    mergeCodexState(username, state, previousById.get(state.localSessionId)),
  );
  for (const session of nextSessions) {
    const previous = previousById.get(session.localSessionId);
    if (previous && isDeepStrictEqual(previous, session)) continue;
    writeAISessionState(username, session);
  }

  const otherSummaries = current.index.sessions.filter((summary) => summary.provider !== 'codex');
  const summaries = sortAISessionSummaries([
    ...otherSummaries,
    ...nextSessions.map(createAISessionSummary),
  ]);
  const activeByProvider = { ...current.index.activeByProvider };
  if (nextRegistry.activeSessionId === null) {
    delete activeByProvider.codex;
  } else {
    activeByProvider.codex = nextRegistry.activeSessionId;
  }
  const updatedAt = maxTimestamp(
    now().toISOString(),
    ...summaries.map((summary) => summary.lastUsedAt),
    ...(current.index.migration ? [current.index.migration.completedAt] : []),
  );
  const index: AISessionIndexV1 = {
    ...current.index,
    activeByProvider,
    sessions: summaries,
    updatedAt,
  };
  writeAISessionIndex(username, index);
  return nextRegistry;
}
