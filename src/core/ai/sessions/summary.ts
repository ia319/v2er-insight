import type { AISessionStateV1, AISessionSummary } from './types';

/**
 * Builds the index projection for one validated provider session.
 * @param session - Persisted provider session to summarize.
 * @returns The exact session fields stored in the shared index.
 */
export function createAISessionSummary(session: AISessionStateV1): AISessionSummary {
  return {
    localSessionId: session.localSessionId,
    provider: session.provider,
    generation: session.generation,
    status: session.provider === 'codex' ? session.bootstrapStatus : 'ready',
    model: session.model,
    promptHash: session.promptHash,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    externalThreadId: session.provider === 'codex' ? session.externalThreadId : null,
  };
}
