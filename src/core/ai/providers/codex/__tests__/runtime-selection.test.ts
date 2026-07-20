import { describe, expect, it, vi } from 'vitest';
import type {
  CodexAccountStatus,
  CodexAppServerExit,
  CodexExecutableCandidate,
  CodexModelInfo,
  CodexServerInfo,
} from '@/infra/codex';
import { selectCodexRuntime, type CodexRuntimeConnection } from '../runtime-selection';

const first = createCandidate('C:\\codex\\first.exe', 'running-app-server');
const second = createCandidate('C:\\codex\\second.cmd', 'path', 'command-shim');

describe('selectCodexRuntime', () => {
  it('should continue after an unusable candidate and retain diagnostics', async () => {
    const firstConnection = createConnection({
      initializeError: new Error('unsupported protocol'),
    });
    const secondConnection = createConnection();
    const dependencies = {
      probeVersion: vi.fn(async (candidate: CodexExecutableCandidate) =>
        candidate === first ? '0.144.5' : '0.137.0',
      ),
      connect: vi.fn((candidate: CodexExecutableCandidate) =>
        candidate === first ? firstConnection : secondConnection,
      ),
    };

    const runtime = await selectCodexRuntime([first, second], createOptions(), dependencies);

    expect(runtime.candidate).toBe(second);
    expect(runtime.models).toMatchObject([{ model: 'default-model', isDefault: true }]);
    expect(runtime.model).toMatchObject({ model: 'default-model', reasoningEffort: 'low' });
    expect(runtime.attempts).toMatchObject([{ candidate: first, code: 'protocol_failed' }]);
    expect(firstConnection.close).toHaveBeenCalledOnce();
    await runtime.connection.close();
  });

  it('should stop after an explicit candidate failure', async () => {
    const explicit = createCandidate('C:\\missing\\codex.exe', 'explicit');
    const dependencies = {
      probeVersion: vi.fn(async () => {
        throw new Error('not found');
      }),
      connect: vi.fn(() => createConnection()),
    };

    await expect(
      selectCodexRuntime([explicit, second], createOptions(), dependencies),
    ).rejects.toMatchObject({
      attempts: [{ candidate: explicit, code: 'version_failed' }],
    });
    expect(dependencies.probeVersion).toHaveBeenCalledOnce();
    expect(dependencies.connect).not.toHaveBeenCalled();
  });

  it('should reject candidates that require an unavailable account', async () => {
    const connection = createConnection({
      account: { accountType: null, requiresOpenaiAuth: true },
    });
    const dependencies = {
      probeVersion: vi.fn(async () => '0.144.5'),
      connect: vi.fn(() => connection),
    };

    await expect(selectCodexRuntime([first], createOptions(), dependencies)).rejects.toMatchObject({
      attempts: [{ code: 'account_unavailable' }],
    });
    expect(connection.listModels).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalledOnce();
  });
});

function createOptions() {
  return {
    versionTimeoutMs: 1000,
    process: { requestTimeoutMs: 1000, shutdownGraceMs: 1000 },
    connection: { startupTimeoutMs: 1000 },
    model: {},
  };
}

function createCandidate(
  path: string,
  source: CodexExecutableCandidate['source'],
  kind: CodexExecutableCandidate['kind'] = 'native',
): CodexExecutableCandidate {
  return { path, source, kind };
}

function createConnection(
  options: {
    initializeError?: Error;
    account?: CodexAccountStatus;
  } = {},
) {
  const server: CodexServerInfo = {
    userAgent: 'codex_cli_rs/test',
    codexHome: 'C:\\Users\\test\\.codex',
    platformFamily: 'windows',
    platformOs: 'windows',
  };
  const exit: CodexAppServerExit = { code: 0, signal: null, forced: false, stderr: '' };
  const model: CodexModelInfo = {
    id: 'default-model',
    model: 'default-model',
    displayName: 'Default Model',
    description: '',
    hidden: false,
    isDefault: true,
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: [{ reasoningEffort: 'low', description: '' }],
  };

  return {
    initialize: vi.fn(async () => {
      if (options.initializeError) throw options.initializeError;
      return server;
    }),
    readAccount: vi.fn(async () =>
      Promise.resolve(options.account ?? { accountType: 'chatgpt', requiresOpenaiAuth: true }),
    ),
    listModels: vi.fn(async () => Promise.resolve([model])),
    startThread: vi.fn(async () => {
      throw new Error('Not used by runtime selection tests');
    }),
    resumeThread: vi.fn(async () => {
      throw new Error('Not used by runtime selection tests');
    }),
    readThread: vi.fn(async () => {
      throw new Error('Not used by runtime selection tests');
    }),
    setThreadName: vi.fn(async () => {
      throw new Error('Not used by runtime selection tests');
    }),
    runTurn: vi.fn(async () => {
      throw new Error('Not used by runtime selection tests');
    }),
    close: vi.fn(async () => Promise.resolve(exit)),
  } satisfies CodexRuntimeConnection;
}
