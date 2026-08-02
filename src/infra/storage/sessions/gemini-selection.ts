import { randomUUID } from 'node:crypto';
import { isLocalSessionId } from '@/core/ai/sessions/identifiers';
import {
  AI_SESSION_STATE_SCHEMA_VERSION,
  type AISessionIndexV1,
  type GeminiSessionStateV1,
} from '@/core/ai/sessions/types';
import { AISessionStoreCorruptError } from './errors';
import { readAISessionStore } from './repository';

export interface PrepareGeminiAnalysisSessionOptions {
  username: string;
  model: string;
  promptHash: string;
  systemInstruction: string;
  thinkingLevel: string;
  forceNew?: boolean;
}

export interface PreparedGeminiAnalysisSession {
  index: AISessionIndexV1;
  session: GeminiSessionStateV1;
  isNew: boolean;
}

function isCompatible(
  session: GeminiSessionStateV1,
  options: Pick<PrepareGeminiAnalysisSessionOptions, 'model' | 'promptHash' | 'systemInstruction'>,
): boolean {
  return (
    session.model === options.model &&
    session.promptHash === options.promptHash &&
    session.systemInstruction === options.systemInstruction
  );
}

/**
 * Selects the compatible active Gemini session or creates an unpersisted next generation.
 * @param options - User, model, prompt, instruction, and generation selection inputs.
 * @param now - Clock used for a new session timestamp.
 * @param createId - Canonical local session ID generator.
 * @returns The selected session and the index state it was selected from.
 * @throws When the shared session store is missing or invalid.
 */
export function prepareGeminiAnalysisSession(
  options: PrepareGeminiAnalysisSessionOptions,
  now: () => Date = () => new Date(),
  createId: () => string = randomUUID,
): PreparedGeminiAnalysisSession {
  const store = readAISessionStore(options.username);
  if (store.status !== 'valid') throw new AISessionStoreCorruptError();
  const sessions = store.sessions.filter(
    (session): session is GeminiSessionStateV1 => session.provider === 'gemini',
  );
  const activeId = store.index.activeByProvider.gemini;
  const active = sessions.find((session) => session.localSessionId === activeId);
  if (!options.forceNew && active && isCompatible(active, options)) {
    return { index: store.index, session: active, isNew: false };
  }

  const timestamp = now().toISOString();
  const localSessionId = createId();
  if (!isLocalSessionId(localSessionId)) {
    throw new TypeError('Gemini local session ID must be a canonical UUID');
  }
  const generation = sessions.reduce(
    (maximum, session) => Math.max(maximum, session.generation),
    0,
  );
  return {
    index: store.index,
    isNew: true,
    session: {
      schemaVersion: AI_SESSION_STATE_SCHEMA_VERSION,
      localSessionId,
      username: options.username,
      provider: 'gemini',
      generation: generation + 1,
      promptHash: options.promptHash,
      model: options.model,
      createdAt: timestamp,
      lastUsedAt: timestamp,
      lastSuccessfulAnalysisAt: null,
      lastResultVersionId: null,
      lastAnalysisFingerprint: null,
      systemInstruction: options.systemInstruction,
      thinkingLevel: options.thinkingLevel,
      history: [],
    },
  };
}
