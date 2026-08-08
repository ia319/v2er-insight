import type { AISessionIndexV1, AISessionProvider, AISessionStateV1 } from '@/core/ai';
import {
  AISessionPersistError,
  AISessionStoreCorruptError,
  ChatSessionMissingError,
  inspectCodexSessionStorage,
  readAISessionStore,
} from '@/infra/storage';

export type SessionClearProvider = AISessionProvider | 'all' | undefined;

export interface SessionClearPreviewTarget {
  provider: AISessionProvider;
  localSessionId: string;
  generation: number;
  externalThreadId: string | null;
  displayName: string | null;
}

export interface ResolvedSessionClearScope {
  index: AISessionIndexV1;
  sessions: AISessionStateV1[];
}

function compareClearTargets(
  left: Pick<SessionClearPreviewTarget, 'provider' | 'generation' | 'localSessionId'>,
  right: Pick<SessionClearPreviewTarget, 'provider' | 'generation' | 'localSessionId'>,
): number {
  return (
    left.provider.localeCompare(right.provider) ||
    left.generation - right.generation ||
    left.localSessionId.localeCompare(right.localSessionId)
  );
}

function selectStoredSessions(
  store: Extract<ReturnType<typeof readAISessionStore>, { status: 'valid' }>,
  provider: SessionClearProvider,
  allVersions: boolean,
): AISessionStateV1[] {
  const providers: AISessionProvider[] =
    provider === 'all'
      ? ['codex', 'gemini']
      : [provider ?? store.index.lastSuccessfulAnalysisProvider].filter(
          (value): value is AISessionProvider => value !== null,
        );
  if (providers.length === 0) throw new ChatSessionMissingError(null);
  if (allVersions) {
    return store.sessions
      .filter((session) => providers.includes(session.provider))
      .sort(compareClearTargets);
  }

  return providers.flatMap((selectedProvider) => {
    const localSessionId = store.index.activeByProvider[selectedProvider];
    if (!localSessionId) return [];
    const session = store.sessions.find(
      (candidate) =>
        candidate.provider === selectedProvider && candidate.localSessionId === localSessionId,
    );
    return session ? [session] : [];
  });
}

function toPreview(session: AISessionStateV1): SessionClearPreviewTarget {
  return {
    provider: session.provider,
    localSessionId: session.localSessionId,
    generation: session.generation,
    externalThreadId: session.provider === 'codex' ? session.externalThreadId : null,
    displayName: session.provider === 'codex' ? session.displayName : null,
  };
}

function resolveLegacyPreview(
  username: string,
  provider: SessionClearProvider,
  allVersions: boolean,
): SessionClearPreviewTarget[] {
  if (provider === 'gemini') return [];
  const storage = inspectCodexSessionStorage(username);
  if (storage.migration !== 'pending' || storage.registry.status !== 'valid') return [];
  const registry = storage.registry.registry;
  const sessions = allVersions
    ? registry.sessions
    : registry.sessions.filter((session) => session.localSessionId === registry.activeSessionId);
  return sessions
    .map((session) => ({
      provider: 'codex' as const,
      localSessionId: session.localSessionId,
      generation: session.generation,
      externalThreadId: session.threadId,
      displayName: session.displayName,
    }))
    .sort(compareClearTargets);
}

/**
 * Parses the optional provider scope accepted by session clear.
 * @param value - Raw CLI provider option.
 * @returns A validated provider, `all`, or the default undefined scope.
 * @throws {TypeError} When the option is not a supported clear provider.
 */
export function parseSessionClearProvider(value: string | undefined): SessionClearProvider {
  if (value === undefined || value === 'gemini' || value === 'codex' || value === 'all') {
    return value;
  }
  throw new TypeError(`Invalid session clear provider: ${value}`);
}

/**
 * Resolves the exact read-only target list that will be shown before confirmation.
 * @param username - Owner of the provider sessions.
 * @param provider - Validated provider scope.
 * @param allVersions - Whether every generation is in scope.
 * @returns Canonically ordered local and external deletion identities.
 * @throws When the store is invalid or the selected scope is empty.
 */
export function buildSessionClearPreview(
  username: string,
  provider: SessionClearProvider,
  allVersions: boolean,
): SessionClearPreviewTarget[] {
  const store = readAISessionStore(username);
  if (store.status === 'invalid') throw new AISessionStoreCorruptError();
  const targets =
    store.status === 'valid'
      ? selectStoredSessions(store, provider, allVersions).map(toPreview)
      : resolveLegacyPreview(username, provider, allVersions);
  if (targets.length === 0) {
    throw new ChatSessionMissingError(provider === 'all' ? null : (provider ?? null));
  }
  return targets.sort(compareClearTargets);
}

/**
 * Compares a confirmed preview with a freshly resolved locked scope.
 * @param preview - Targets presented to the user.
 * @param sessions - Current sessions selected under their locks.
 * @returns Whether every destructive identity remains unchanged.
 */
export function sessionClearPreviewsMatch(
  preview: readonly SessionClearPreviewTarget[],
  sessions: readonly AISessionStateV1[],
): boolean {
  const actual = sessions.map(toPreview).sort(compareClearTargets);
  return (
    preview.length === actual.length &&
    preview.every((target, index) => {
      const candidate = actual[index];
      return (
        candidate?.provider === target.provider &&
        candidate.localSessionId === target.localSessionId &&
        candidate.generation === target.generation &&
        candidate.externalThreadId === target.externalThreadId
      );
    })
  );
}

/**
 * Re-resolves the selected scope after confirmation and while target locks are held.
 * @param username - Owner of the provider sessions.
 * @param provider - Confirmed provider scope.
 * @param allVersions - Confirmed generation expansion.
 * @returns The current index snapshot and selected provider sessions.
 * @throws {AISessionPersistError} When the store disappeared or became invalid.
 */
export function resolveConfirmedSessionClearScope(
  username: string,
  provider: SessionClearProvider,
  allVersions: boolean,
): ResolvedSessionClearScope {
  const store = readAISessionStore(username);
  if (store.status !== 'valid') {
    throw new AISessionPersistError('AI session store changed after confirmation');
  }
  const sessions = selectStoredSessions(store, provider, allVersions);
  if (sessions.length === 0) throw new ChatSessionMissingError(null);
  return { index: store.index, sessions };
}
