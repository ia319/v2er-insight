import path from 'node:path';
import { isLocalSessionId } from '@/core/ai/sessions/identifiers';
import type { AISessionProvider } from '@/core/ai/sessions/types';
import { getUserDataDir } from '../paths';

const SESSIONS_DIR = 'sessions';

/** Returns the root directory for one user's provider sessions. */
export function getAISessionsRootDir(username: string): string {
  return path.join(getUserDataDir(username), SESSIONS_DIR);
}

/** Returns the path to one user's session index. */
export function getAISessionIndexPath(username: string): string {
  return path.join(getAISessionsRootDir(username), 'index.json');
}

/** Returns the directory for one user's provider-specific session files. */
export function getAISessionProviderDir(username: string, provider: AISessionProvider): string {
  return path.join(getAISessionsRootDir(username), provider);
}

/**
 * Returns one provider-specific session file path.
 * @throws {TypeError} When the local session ID is not a canonical UUID.
 */
export function getAISessionFilePath(
  username: string,
  provider: AISessionProvider,
  localSessionId: string,
): string {
  if (!isLocalSessionId(localSessionId)) {
    throw new TypeError(`Invalid local AI session ID: ${localSessionId}`);
  }
  return path.join(getAISessionProviderDir(username, provider), `${localSessionId}.json`);
}
