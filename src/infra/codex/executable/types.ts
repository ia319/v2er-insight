export type CodexExecutableSource = 'explicit' | 'running-app-server' | 'app-bundle' | 'path';

export type CodexExecutableKind = 'native' | 'command-shim';

export type CodexExecutableTrust =
  | { status: 'trusted'; basis: 'explicit' }
  | { status: 'trusted'; basis: 'windows-authenticode'; publisher: string }
  | { status: 'manual_only'; reason: 'explicit_path_required' }
  | {
      status: 'rejected';
      reason: 'signature_unavailable' | 'signature_invalid' | 'publisher_mismatch';
      publisher?: string;
    };

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

/** A discovered executable together with the evidence controlling automatic execution. */
export interface CodexExecutableObservation {
  candidate: CodexExecutableCandidate;
  trust: CodexExecutableTrust;
}

/** Separates diagnostic observations from candidates authorized for process launch. */
export interface CodexExecutableDiscovery {
  observations: CodexExecutableObservation[];
  launchCandidates: CodexExecutableCandidate[];
}
