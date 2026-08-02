import { type CodexThreadRegistryV1 } from '@/core/ai/providers/codex/thread-state';
import { isCodexThreadRegistryV1 } from '@/core/ai/providers/codex/thread-state-validator';
import { readDataFileResult } from './reader';

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

/**
 * Reads and validates one user's legacy Codex thread registry.
 * @param username - Owner of the legacy registry.
 * @returns Missing, invalid, or validated registry state.
 */
export function readCodexThreadRegistry(username: string): CodexThreadRegistryReadResult {
  const result = readDataFileResult(username, 'codexSessions');
  if (result.status !== 'success') return result;
  return isCodexThreadRegistryV1(result.data)
    ? { status: 'valid', registry: result.data }
    : { status: 'invalid' };
}
