export type CodexExecutableSource = 'explicit' | 'running-app-server' | 'app-bundle' | 'path';

export type CodexExecutableKind = 'native' | 'command-shim';

/** User-controlled inputs for Codex executable discovery. */
export interface CodexExecutableDiscoveryOptions {
  explicitPath?: string;
}

/** A local Codex CLI candidate and the evidence used to discover it. */
export interface CodexExecutableCandidate {
  path: string;
  source: CodexExecutableSource;
  kind: CodexExecutableKind;
}
