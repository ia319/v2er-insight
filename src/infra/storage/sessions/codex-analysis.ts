import { isDeepStrictEqual } from 'node:util';
import {
  createAISessionSummary,
  sortAISessionSummaries,
  type AISessionIndexV1,
  type AISessionStateV1,
  type AISessionSummary,
  type CodexSessionStateV1,
} from '@/core/ai/sessions';
import { parseResultVersionId, type ResultVersionMetadata } from '@/core/result-version';
import { assertCodexSessionMigrationIdentity } from './codex-registry';
import { AISessionPersistError, AISessionStoreCorruptError } from './errors';
import {
  readAISessionIndex,
  readAISessionState,
  withAISessionIndexTransaction,
  writeAISessionIndex,
  writeAISessionState,
} from './repository';

export interface RecoverCodexAnalysisSessionOptions {
  username: string;
  metadata: ResultVersionMetadata;
}

export type RecoverCodexAnalysisSessionResult =
  | { status: 'pending'; session: CodexSessionStateV1 }
  | { status: 'completed'; session: CodexSessionStateV1 };

interface RecoverableCodexStore {
  index: AISessionIndexV1;
  sessions: AISessionStateV1[];
  target: CodexSessionStateV1;
}

function maxTimestamp(...timestamps: string[]): string {
  return timestamps.reduce((latest, timestamp) => (timestamp > latest ? timestamp : latest));
}

function successfulAt(metadata: ResultVersionMetadata): string {
  return metadata.createdAt ?? metadata.savedAt;
}

function hasResultAssociation(
  session: CodexSessionStateV1,
  metadata: ResultVersionMetadata,
): boolean {
  return (
    session.lastSuccessfulAnalysisAt === successfulAt(metadata) &&
    session.lastResultVersionId === metadata.versionId &&
    session.lastAnalysisFingerprint === metadata.analysisFingerprint
  );
}

function isRecoverableTargetSummary(
  session: CodexSessionStateV1,
  summary: AISessionSummary,
  metadata: ResultVersionMetadata,
): boolean {
  return (
    session.bootstrapStatus === 'ready' &&
    session.pendingAnalysis === undefined &&
    summary.localSessionId === session.localSessionId &&
    summary.provider === 'codex' &&
    summary.generation === session.generation &&
    summary.model === session.model &&
    summary.promptHash === session.promptHash &&
    summary.createdAt === session.createdAt &&
    summary.externalThreadId === session.threadId &&
    summary.lastUsedAt <= session.lastUsedAt &&
    (summary.status !== 'ready' ||
      summary.lastUsedAt !== session.lastUsedAt ||
      hasResultAssociation(session, metadata))
  );
}

function assertResultIdentity(session: CodexSessionStateV1, metadata: ResultVersionMetadata): void {
  if (
    metadata.provider !== 'codex' ||
    metadata.localSessionId !== session.localSessionId ||
    metadata.externalThreadId !== session.threadId ||
    metadata.threadName !== session.displayName ||
    metadata.model !== session.model ||
    metadata.reasoningLevel !==
      (session.pendingAnalysis?.reasoningEffort ?? session.lastReasoningEffort) ||
    metadata.promptHash !== session.promptHash ||
    metadata.analysisFingerprint === null ||
    metadata.payloadHash === null ||
    metadata.deliveryId === null ||
    parseResultVersionId(metadata.versionId) !== metadata.sequence ||
    (metadata.dataQuality !== 'complete' && metadata.dataQuality !== 'partial') ||
    (metadata.origin !== 'analysis' && metadata.origin !== 'resend')
  ) {
    throw new AISessionPersistError('Codex result metadata does not match its local session');
  }
}

function readRecoverableStore(
  username: string,
  metadata: ResultVersionMetadata,
): RecoverableCodexStore {
  const localSessionId = metadata.localSessionId;
  if (!localSessionId) {
    throw new AISessionPersistError('Saved Codex result does not identify its local session');
  }
  const indexResult = readAISessionIndex(username);
  if (indexResult.status !== 'valid') throw new AISessionStoreCorruptError();
  assertCodexSessionMigrationIdentity(username, indexResult.index);

  const sessions: AISessionStateV1[] = [];
  let target: CodexSessionStateV1 | null = null;
  for (const summary of indexResult.index.sessions) {
    const state = readAISessionState(username, summary.provider, summary.localSessionId);
    if (state.status !== 'valid') throw new AISessionStoreCorruptError();
    const isTarget = summary.provider === 'codex' && summary.localSessionId === localSessionId;
    if (isTarget) {
      if (state.session.provider !== 'codex') throw new AISessionStoreCorruptError();
      target = state.session;
      const summaryMatches = isDeepStrictEqual(createAISessionSummary(state.session), summary);
      if (!summaryMatches && !isRecoverableTargetSummary(state.session, summary, metadata)) {
        throw new AISessionStoreCorruptError();
      }
    } else if (!isDeepStrictEqual(createAISessionSummary(state.session), summary)) {
      throw new AISessionStoreCorruptError();
    }
    sessions.push(state.session);
  }
  if (!target) {
    throw new AISessionPersistError(`Codex local session "${localSessionId}" was not found`);
  }
  assertResultIdentity(target, metadata);
  return { index: indexResult.index, sessions, target };
}

function pendingMatchesResult(
  session: CodexSessionStateV1,
  metadata: ResultVersionMetadata,
): boolean {
  const pending = session.pendingAnalysis;
  return (
    pending !== undefined &&
    pending.deliveryId === metadata.deliveryId &&
    pending.analysisFingerprint === metadata.analysisFingerprint &&
    pending.payloadHash === metadata.payloadHash &&
    pending.basedOnPartial === (metadata.dataQuality === 'partial') &&
    pending.deliveryMode === (metadata.origin === 'resend' ? 'resend' : 'change') &&
    pending.reasoningEffort === metadata.reasoningLevel &&
    pending.turnId !== null
  );
}

function createCompletedSession(
  session: CodexSessionStateV1,
  metadata: ResultVersionMetadata,
): CodexSessionStateV1 {
  if (session.bootstrapStatus !== 'ready' || session.pendingAnalysis !== undefined) {
    throw new AISessionPersistError('Codex session has not completed its accepted analysis turn');
  }
  const timestamp = successfulAt(metadata);
  if (timestamp < session.createdAt) {
    throw new AISessionPersistError('Codex result predates its local session');
  }
  if (session.lastResultVersionId === metadata.versionId) {
    if (!hasResultAssociation(session, metadata)) {
      throw new AISessionPersistError('Codex session result association is inconsistent');
    }
    return session;
  }
  if (session.lastResultVersionId !== null) {
    const previousSequence = parseResultVersionId(session.lastResultVersionId);
    if (previousSequence === null || previousSequence >= metadata.sequence) {
      throw new AISessionPersistError('Codex result association would move backward');
    }
  }
  return {
    ...session,
    lastUsedAt: maxTimestamp(session.lastUsedAt, timestamp),
    lastSuccessfulAnalysisAt: timestamp,
    lastResultVersionId: metadata.versionId,
    lastAnalysisFingerprint: metadata.analysisFingerprint,
  };
}

function createCompletedIndex(
  store: RecoverableCodexStore,
  completed: CodexSessionStateV1,
  now: string,
): AISessionIndexV1 {
  const sessions = sortAISessionSummaries(
    store.sessions.map((session) =>
      session.localSessionId === completed.localSessionId
        ? createAISessionSummary(completed)
        : createAISessionSummary(session),
    ),
  );
  return {
    ...store.index,
    lastSuccessfulAnalysisProvider: 'codex',
    activeByProvider: { ...store.index.activeByProvider, codex: completed.localSessionId },
    sessions,
    updatedAt: maxTimestamp(
      store.index.updatedAt,
      now,
      ...sessions.map((summary) => summary.lastUsedAt),
      ...(store.index.migration ? [store.index.migration.completedAt] : []),
    ),
  };
}

/**
 * Restores the Codex result association after its immutable result version is available.
 * @param options - User and committed Codex result metadata.
 * @param now - Clock used when publishing the shared session index.
 * @returns Pending when the accepted turn still needs completion, otherwise the associated session.
 * @throws When result identity, turn state, or indexed session data is inconsistent.
 */
export function recoverCodexAnalysisSession(
  options: RecoverCodexAnalysisSessionOptions,
  now: () => Date = () => new Date(),
): RecoverCodexAnalysisSessionResult {
  return withAISessionIndexTransaction(options.username, () => {
    const store = readRecoverableStore(options.username, options.metadata);
    if (store.target.pendingAnalysis !== undefined) {
      if (!pendingMatchesResult(store.target, options.metadata)) {
        throw new AISessionPersistError(
          'Saved Codex result does not match its pending analysis turn',
        );
      }
      return { status: 'pending', session: store.target };
    }

    const completed = createCompletedSession(store.target, options.metadata);
    const completedIndex = createCompletedIndex(store, completed, now().toISOString());
    if (!isDeepStrictEqual(completed, store.target)) {
      writeAISessionState(options.username, completed);
    }
    if (!isDeepStrictEqual(completedIndex, store.index)) {
      writeAISessionIndex(options.username, completedIndex);
    }
    return { status: 'completed', session: completed };
  });
}
