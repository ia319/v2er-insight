import { describe, expect, it, vi } from 'vitest';
import type { ResolvedCodexConfig } from '@/config';
import {
  CodexRuntimeSelectionError,
  type CodexRuntimeAttempt,
  type CodexRuntimeConnection,
  type CodexThreadRegistryV1,
  type CodexThreadState,
  type SelectedCodexRuntime,
} from '@/core/ai/providers/codex';
import type {
  CodexExecutableCandidate,
  CodexExecutableDiscovery,
  CodexModelInfo,
  CodexThreadInfo,
} from '@/infra/codex';
import { checkCodexSession, type CodexSessionCheckDependencies } from '../codex-check';

const CONFIG: ResolvedCodexConfig = {
  model: 'app-default',
  reasoningEffort: 'model-default',
  startupTimeout: 1000,
  turnTimeout: 60_000,
  shutdownGrace: 1000,
};

const first: CodexExecutableCandidate = {
  path: 'C:\\App\\old-codex.exe',
  source: 'running-app-server',
  kind: 'native',
};
const second: CodexExecutableCandidate = {
  path: 'C:\\App\\codex.exe',
  source: 'app-bundle',
  kind: 'native',
};
const manualOnly: CodexExecutableCandidate = {
  path: 'C:\\tools\\codex.cmd',
  source: 'path',
  kind: 'command-shim',
};
const third: CodexExecutableCandidate = {
  path: 'C:\\App\\fallback-codex.exe',
  source: 'app-bundle',
  kind: 'native',
};

function createDiscovery(
  launchCandidates: readonly CodexExecutableCandidate[] = [first, second],
): CodexExecutableDiscovery {
  return {
    observations: launchCandidates.map((candidate) => ({
      candidate,
      trust: {
        status: 'trusted',
        basis: 'windows-authenticode',
        publisher: 'OpenAI OpCo, LLC',
      },
    })),
    launchCandidates: [...launchCandidates],
  };
}

function createSession(): CodexThreadState {
  return {
    kind: 'codex',
    schemaVersion: 1,
    localSessionId: 'local-1',
    threadId: 'thread-1',
    generation: 1,
    displayName: 'alice-insight',
    promptHash: 'a'.repeat(64),
    bootstrapStatus: 'ready',
    promptTurnId: 'turn-prompt',
    initialAnalysisTurnId: 'turn-analysis',
    lastTurnId: 'turn-analysis',
    model: 'gpt-current',
    lastReasoningEffort: 'high',
    executablePath: second.path,
    executableVersion: '0.2.0',
    projectPath: 'D:\\data',
    instructionSources: [],
    createdAt: '2026-07-20T01:00:00.000Z',
    lastUsedAt: '2026-07-20T02:00:00.000Z',
  };
}

function createConnection(thread: CodexThreadInfo): CodexRuntimeConnection {
  return {
    initialize: vi.fn(async () => ({
      userAgent: 'codex/test',
      codexHome: 'C:\\Users\\test\\.codex',
      platformFamily: 'windows',
      platformOs: 'windows',
    })),
    readAccount: vi.fn(async () => ({ accountType: 'chatgpt', requiresOpenaiAuth: true })),
    listModels: vi.fn(async () => []),
    startThread: vi.fn(async () => {
      throw new Error('Not used');
    }),
    resumeThread: vi.fn(async () => {
      throw new Error('Not used');
    }),
    readThread: vi.fn(async () => thread),
    setThreadName: vi.fn(async () => undefined),
    runTurn: vi.fn(async () => {
      throw new Error('Not used');
    }),
    close: vi.fn(async () => ({ code: 0, signal: null, forced: false, stderr: '' })),
  };
}

function createDependencies(
  overrides: Partial<CodexSessionCheckDependencies> = {},
): CodexSessionCheckDependencies {
  const session = createSession();
  const registry: CodexThreadRegistryV1 = {
    schemaVersion: 1,
    activeSessionId: session.localSessionId,
    sessions: [session],
  };
  const thread: CodexThreadInfo = {
    id: session.threadId,
    name: session.displayName,
    cwd: session.projectPath,
    status: { type: 'idle' },
    turns: [{ id: 'turn-analysis', status: 'completed', error: null, agentMessages: [] }],
  };
  const model: CodexModelInfo = {
    id: 'catalog-current',
    model: 'gpt-current',
    displayName: 'GPT Current',
    description: '',
    hidden: false,
    isDefault: true,
    defaultReasoningEffort: 'high',
    supportedReasoningEfforts: [
      { reasoningEffort: 'medium', description: '' },
      { reasoningEffort: 'high', description: '' },
    ],
  };
  const connection = createConnection(thread);
  const attempt: CodexRuntimeAttempt = {
    candidate: first,
    code: 'version_failed',
    message: 'old version unavailable',
  };
  const runtime: SelectedCodexRuntime = {
    candidate: second,
    version: '0.2.0',
    server: {
      userAgent: 'codex/test',
      codexHome: 'C:\\Users\\test\\.codex',
      platformFamily: 'windows',
      platformOs: 'windows',
    },
    account: { accountType: 'chatgpt', requiresOpenaiAuth: true },
    models: [model],
    model: {
      catalogId: model.id,
      model: model.model,
      displayName: model.displayName,
      reasoningEffort: 'high',
    },
    connection,
    attempts: [attempt],
  };

  return {
    discover: vi.fn(() => createDiscovery()),
    probeVersion: vi.fn(async (candidate) => {
      if (candidate === first) throw new Error('old version unavailable');
      return '0.2.0';
    }),
    selectRuntime: vi.fn(async (candidates, _options, probeVersion) => {
      for (const candidate of candidates) {
        try {
          await probeVersion(candidate, 1000);
        } catch {
          continue;
        }
        if (candidate === second) return runtime;
      }
      throw new CodexRuntimeSelectionError([attempt]);
    }),
    readRegistry: vi.fn(() => ({ status: 'valid' as const, registry })),
    readLock: vi.fn(() => ({ status: 'missing' as const })),
    resolveProject: vi.fn(() => ({ path: 'D:\\data', source: 'storage' as const })),
    assertProject: vi.fn(),
    ...overrides,
  };
}

describe('checkCodexSession', () => {
  it('should collect candidates, models, registry, and thread state without duplicate version probes', async () => {
    const dependencies = createDependencies({
      discover: vi.fn(() => createDiscovery([first, second, third])),
    });

    const report = await checkCodexSession('alice', CONFIG, dependencies);

    expect(report.issues).toEqual([]);
    expect(report.appDetected).toBe(true);
    expect(report.candidates).toMatchObject([
      { candidate: first, version: { status: 'unavailable' }, selection: 'rejected' },
      {
        candidate: second,
        version: { status: 'available', version: '0.2.0' },
        selection: 'selected',
      },
      { candidate: third, version: { status: 'not_checked' }, selection: 'not_checked' },
    ]);
    expect(dependencies.probeVersion).toHaveBeenCalledTimes(2);
    expect(dependencies.probeVersion).not.toHaveBeenCalledWith(third, expect.any(Number));
    expect(report.runtime).toMatchObject({
      executablePath: second.path,
      selectedModel: 'gpt-current',
      selectedReasoningEffort: 'high',
      models: [
        {
          model: 'gpt-current',
          isDefault: true,
          supportedReasoningEfforts: ['medium', 'high'],
        },
      ],
    });
    expect(report.thread).toMatchObject({
      threadId: 'thread-1',
      lastTurnId: 'turn-analysis',
      lastTurnStatus: 'completed',
      projectMatchesRegistry: true,
    });
  });

  it('should retain independent Project, registry, lock, and runtime failures', async () => {
    const attempt: CodexRuntimeAttempt = {
      candidate: first,
      code: 'protocol_failed',
      message: 'initialize failed',
      version: '0.1.0',
    };
    const dependencies = createDependencies({
      discover: vi.fn(() => createDiscovery([first])),
      probeVersion: vi.fn(async () => '0.1.0'),
      selectRuntime: vi.fn(async () => {
        throw new CodexRuntimeSelectionError([attempt]);
      }),
      readRegistry: vi.fn(() => ({ status: 'invalid' as const })),
      readLock: vi.fn(() => ({ status: 'invalid' as const })),
      assertProject: vi.fn(() => {
        throw new Error('project unavailable');
      }),
    });

    const report = await checkCodexSession('alice', CONFIG, dependencies);

    expect(report.runtime).toBeNull();
    expect(report.registry).toEqual({ status: 'invalid' });
    expect(report.lock).toEqual({ status: 'invalid' });
    expect(report.project).toMatchObject({ status: 'unavailable', code: 'unavailable' });
    expect(report.issues.map((issue) => issue.code)).toEqual([
      'project_unavailable',
      'registry_invalid',
      'lock_invalid',
      'runtime_unavailable',
    ]);
    expect(report.candidates).toMatchObject([
      { selection: 'rejected', attemptCode: 'protocol_failed' },
    ]);
  });

  it('should report manual-only candidates without probing or launching them', async () => {
    const discovery = createDiscovery([second]);
    discovery.observations.push({
      candidate: manualOnly,
      trust: { status: 'manual_only', reason: 'explicit_path_required' },
    });
    const dependencies = createDependencies({
      discover: vi.fn(() => discovery),
    });

    const report = await checkCodexSession('alice', CONFIG, dependencies);

    expect(dependencies.selectRuntime).toHaveBeenCalledWith(
      [second],
      expect.any(Object),
      expect.any(Function),
    );
    expect(dependencies.probeVersion).toHaveBeenCalledTimes(1);
    expect(dependencies.probeVersion).not.toHaveBeenCalledWith(manualOnly, expect.any(Number));
    expect(report.candidates).toContainEqual(
      expect.objectContaining({
        candidate: manualOnly,
        version: { status: 'not_checked' },
        selection: 'not_checked',
      }),
    );
  });

  it('should expose the live model catalog when configured model selection fails', async () => {
    const dependencies = createDependencies({
      discover: vi.fn(() => createDiscovery([second])),
    });
    const configuredAttempt: CodexRuntimeAttempt = {
      candidate: second,
      code: 'model_invalid',
      modelErrorCode: 'model_unavailable',
      message: 'configured model is unavailable',
      version: '0.2.0',
    };
    const configuredError = new CodexRuntimeSelectionError([configuredAttempt]);
    const selectDefault = dependencies.selectRuntime;
    dependencies.selectRuntime = vi
      .fn()
      .mockImplementationOnce(async (_candidates, _options, probeVersion) => {
        await expect(probeVersion(second, 1000)).resolves.toBe('0.2.0');
        throw configuredError;
      })
      .mockImplementation((...args: Parameters<CodexSessionCheckDependencies['selectRuntime']>) =>
        selectDefault(...args),
      );

    const report = await checkCodexSession(
      'alice',
      { ...CONFIG, model: 'removed-model', reasoningEffort: 'ultra' },
      dependencies,
    );

    expect(dependencies.selectRuntime).toHaveBeenCalledTimes(2);
    expect(dependencies.selectRuntime).toHaveBeenNthCalledWith(
      2,
      [second],
      expect.objectContaining({
        model: { model: 'app-default', reasoningEffort: 'model-default' },
      }),
      expect.any(Function),
    );
    expect(report.issues).toContainEqual({
      code: 'model_configuration_invalid',
      severity: 'error',
      message: 'configured model is unavailable',
    });
    expect(report.candidates).toContainEqual(
      expect.objectContaining({
        candidate: second,
        attemptCode: 'model_invalid',
        modelErrorCode: 'model_unavailable',
      }),
    );
    expect(report.runtime).toMatchObject({
      modelSelection: 'fallback',
      requestedModel: 'removed-model',
      requestedReasoningEffort: 'ultra',
      models: [{ model: 'gpt-current' }],
    });
    expect(dependencies.probeVersion).toHaveBeenCalledOnce();
  });
});
