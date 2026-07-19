import type { CodexProviderConfig } from '@/config';
import {
  connectCodexAppServer,
  probeCodexCliVersion,
  type CodexAccountStatus,
  type CodexAppServerConnectionOptions,
  type CodexAppServerExit,
  type CodexAppServerProcessOptions,
  type CodexExecutableCandidate,
  type CodexModelInfo,
  type CodexServerInfo,
} from '@/infra/codex';
import { resolveCodexModel, type ResolvedCodexModel } from './model-selection';

export type CodexRuntimeAttemptCode =
  | 'version_failed'
  | 'protocol_failed'
  | 'account_unavailable'
  | 'model_invalid';

export interface CodexRuntimeAttempt {
  candidate: CodexExecutableCandidate;
  code: CodexRuntimeAttemptCode;
  message: string;
  version?: string;
}

export interface CodexRuntimeConnection {
  initialize(): Promise<CodexServerInfo>;
  readAccount(): Promise<CodexAccountStatus>;
  listModels(): Promise<CodexModelInfo[]>;
  close(): Promise<CodexAppServerExit>;
}

export interface SelectedCodexRuntime {
  candidate: CodexExecutableCandidate;
  version: string;
  server: CodexServerInfo;
  account: CodexAccountStatus;
  model: ResolvedCodexModel;
  connection: CodexRuntimeConnection;
  attempts: CodexRuntimeAttempt[];
}

export interface CodexRuntimeSelectionOptions {
  versionTimeoutMs: number;
  process: CodexAppServerProcessOptions;
  connection: CodexAppServerConnectionOptions;
  model: Pick<CodexProviderConfig, 'model' | 'reasoningEffort'>;
}

interface CodexRuntimeDependencies {
  probeVersion(candidate: CodexExecutableCandidate, timeoutMs: number): Promise<string>;
  connect(
    candidate: CodexExecutableCandidate,
    processOptions: CodexAppServerProcessOptions,
    connectionOptions: CodexAppServerConnectionOptions,
  ): CodexRuntimeConnection;
}

const DEFAULT_DEPENDENCIES: CodexRuntimeDependencies = {
  probeVersion: probeCodexCliVersion,
  connect: connectCodexAppServer,
};

export class CodexRuntimeSelectionError extends Error {
  readonly attempts: readonly CodexRuntimeAttempt[];

  constructor(attempts: readonly CodexRuntimeAttempt[]) {
    super('No compatible Codex App Server runtime is available');
    this.name = 'CodexRuntimeSelectionError';
    this.attempts = attempts;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createAttempt(
  candidate: CodexExecutableCandidate,
  code: CodexRuntimeAttemptCode,
  error: unknown,
  version?: string,
): CodexRuntimeAttempt {
  return {
    candidate,
    code,
    message: getErrorMessage(error),
    ...(version ? { version } : {}),
  };
}

/**
 * Selects the first candidate with a valid version, App Server connection, account, and model.
 * @param candidates - Executable candidates in discovery priority order.
 * @param options - Probe deadlines and requested model settings.
 * @param dependencies - Injectable process boundary for deterministic tests.
 * @returns An open, initialized runtime for provider use.
 */
export async function selectCodexRuntime(
  candidates: readonly CodexExecutableCandidate[],
  options: CodexRuntimeSelectionOptions,
  dependencies: CodexRuntimeDependencies = DEFAULT_DEPENDENCIES,
): Promise<SelectedCodexRuntime> {
  const attempts: CodexRuntimeAttempt[] = [];

  for (const candidate of candidates) {
    let version: string;
    try {
      version = await dependencies.probeVersion(candidate, options.versionTimeoutMs);
    } catch (error) {
      attempts.push(createAttempt(candidate, 'version_failed', error));
      if (candidate.source === 'explicit') break;
      continue;
    }

    let connection: CodexRuntimeConnection;
    try {
      connection = dependencies.connect(candidate, options.process, options.connection);
    } catch (error) {
      attempts.push(createAttempt(candidate, 'protocol_failed', error, version));
      if (candidate.source === 'explicit') break;
      continue;
    }

    try {
      const server = await connection.initialize();
      const account = await connection.readAccount();
      if (account.accountType === null && account.requiresOpenaiAuth) {
        attempts.push(
          createAttempt(
            candidate,
            'account_unavailable',
            new Error('Codex account authentication is required'),
            version,
          ),
        );
        await connection.close().catch(() => undefined);
        if (candidate.source === 'explicit') break;
        continue;
      }

      const models = await connection.listModels();
      let model: ResolvedCodexModel;
      try {
        model = resolveCodexModel(models, options.model);
      } catch (error) {
        attempts.push(createAttempt(candidate, 'model_invalid', error, version));
        await connection.close().catch(() => undefined);
        if (candidate.source === 'explicit') break;
        continue;
      }

      return { candidate, version, server, account, model, connection, attempts };
    } catch (error) {
      attempts.push(createAttempt(candidate, 'protocol_failed', error, version));
      await connection.close().catch(() => undefined);
      if (candidate.source === 'explicit') break;
    }
  }

  throw new CodexRuntimeSelectionError(attempts);
}
