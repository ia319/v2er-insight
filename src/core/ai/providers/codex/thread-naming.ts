import type { CodexThreadRegistryV1 } from './thread-state';

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export interface NextCodexThreadIdentity {
  generation: number;
  displayName: string;
}

function getDisplayName(username: string, generation: number): string {
  return generation === 1 ? `${username}-insight` : `${username}-insight-${generation}`;
}

/** Resolves the next generation and collision-free Codex thread display name. */
export function resolveNextCodexThreadIdentity(
  username: string,
  registry: CodexThreadRegistryV1,
): NextCodexThreadIdentity {
  if (!USERNAME_PATTERN.test(username)) {
    throw new RangeError('username must contain only letters, numbers, underscores, or hyphens');
  }

  let generation =
    registry.sessions.reduce((maximum, session) => Math.max(maximum, session.generation), 0) + 1;
  const existingNames = new Set(registry.sessions.map((session) => session.displayName));
  let displayName = getDisplayName(username, generation);
  while (existingNames.has(displayName)) {
    generation += 1;
    displayName = getDisplayName(username, generation);
  }

  return { generation, displayName };
}
