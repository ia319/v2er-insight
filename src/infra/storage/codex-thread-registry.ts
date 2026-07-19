import {
  CODEX_THREAD_REGISTRY_SCHEMA_VERSION,
  type CodexThreadRegistryV1,
} from '@/core/ai/providers/codex/thread-state';
import { isCodexThreadRegistryV1 } from '@/core/ai/providers/codex/thread-state-validator';
import { readDataFileResult } from './reader';
import { writeDataFile } from './writer';

export type CodexThreadRegistryReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; registry: CodexThreadRegistryV1 };

/** Error for an invalid or unreadable existing Codex thread registry. */
export class CodexThreadRegistryCorruptError extends Error {
  constructor() {
    super('codex-sessions.json is invalid or unreadable');
    this.name = 'CodexThreadRegistryCorruptError';
  }
}

/** Reads and validates one user's Codex thread registry. */
export function readCodexThreadRegistry(username: string): CodexThreadRegistryReadResult {
  const result = readDataFileResult(username, 'codexSessions');
  if (result.status !== 'success') return result;
  return isCodexThreadRegistryV1(result.data)
    ? { status: 'valid', registry: result.data }
    : { status: 'invalid' };
}

/** Validates, updates, and atomically persists one user's Codex thread registry. */
export function updateCodexThreadRegistry(
  username: string,
  update: (registry: CodexThreadRegistryV1) => unknown,
): CodexThreadRegistryV1 {
  const existing = readCodexThreadRegistry(username);
  if (existing.status === 'invalid') throw new CodexThreadRegistryCorruptError();

  const current: CodexThreadRegistryV1 =
    existing.status === 'valid'
      ? existing.registry
      : {
          schemaVersion: CODEX_THREAD_REGISTRY_SCHEMA_VERSION,
          activeSessionId: null,
          sessions: [],
        };
  const next = update(current);
  if (!isCodexThreadRegistryV1(next)) {
    throw new TypeError('Codex thread registry update produced invalid state');
  }

  writeDataFile(username, 'codexSessions', next);
  return next;
}
