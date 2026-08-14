import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAIAnalysisResultFixture } from '@/core/ai/__tests__/result-fixture';
import type { CodexThreadRegistryV1, CodexThreadState } from '@/core/ai/providers/codex';
import type { ResultVersionMetadata } from '@/core/result-version';
import type { CodexExecutableCandidate } from '@/infra/codex';

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  assertProject: vi.fn(),
  close: vi.fn(),
  complete: vi.fn(),
  discover: vi.fn(),
  hasReceived: vi.fn(),
  readRegistry: vi.fn(),
  recoverSession: vi.fn(),
  resolveProject: vi.fn(),
  runAnalysis: vi.fn(),
  selectModelRequest: vi.fn(),
  selectRuntime: vi.fn(),
  updateRegistry: vi.fn(),
}));

vi.mock('@/core/ai/providers/codex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/ai/providers/codex')>()),
  activateCodexInitialAnalysisTurn: mocks.activate,
  assertCodexProjectDirectory: mocks.assertProject,
  completeCodexAnalysisUpdateTurn: mocks.complete,
  resolveCodexProjectPath: mocks.resolveProject,
  runCodexAnalysis: mocks.runAnalysis,
  selectCodexRuntime: mocks.selectRuntime,
  selectCodexRuntimeModelRequest: mocks.selectModelRequest,
}));

vi.mock('@/core/provenance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/provenance')>()),
  hasProviderReceivedAnalysis: mocks.hasReceived,
}));

vi.mock('@/infra/codex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/infra/codex')>()),
  discoverCodexExecutables: mocks.discover,
}));

vi.mock('@/infra/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/infra/storage')>()),
  ensureCodexSessionRegistry: mocks.readRegistry,
  recoverCodexAnalysisSession: mocks.recoverSession,
  updateCodexSessionRegistry: mocks.updateRegistry,
}));

import {
  executeCodexAnalysis,
  inspectCodexResultDeliverySession,
  type ExecuteCodexAnalysisOptions,
} from '../codex';

const HASH = 'a'.repeat(64);
const CODEX_CANDIDATE: CodexExecutableCandidate = {
  path: 'C:\\App\\codex.exe',
  source: 'app-bundle',
  kind: 'native',
};
const STATE: CodexThreadState = {
  kind: 'codex',
  schemaVersion: 1,
  localSessionId: 'local-1',
  threadId: 'thread-1',
  generation: 1,
  displayName: 'alice-insight',
  promptHash: HASH,
  bootstrapStatus: 'ready',
  promptTurnId: 'turn-prompt',
  initialAnalysisTurnId: 'turn-analysis',
  lastTurnId: 'turn-analysis',
  model: 'gpt-current',
  lastReasoningEffort: 'high',
  executablePath: 'C:\\App\\codex.exe',
  executableVersion: '0.144.5',
  projectPath: 'D:\\Data',
  instructionSources: [],
  createdAt: '2026-07-19T01:00:00.000Z',
  lastUsedAt: '2026-07-19T01:05:00.000Z',
};

const REGISTRY: CodexThreadRegistryV1 = {
  schemaVersion: 1,
  activeSessionId: 'local-1',
  sessions: [STATE],
};

const RESULT_METADATA: ResultVersionMetadata = {
  versionId: 'v000001',
  sequence: 1,
  origin: 'analysis',
  deliveryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  previousLatestVersionId: null,
  previousCurrentHash: null,
  createdAt: '2026-07-19T01:06:00.000Z',
  savedAt: '2026-07-19T01:06:01.000Z',
  provider: 'codex',
  model: 'gpt-current',
  reasoningLevel: 'high',
  localSessionId: 'local-1',
  externalThreadId: 'thread-1',
  threadName: 'alice-insight',
  promptHash: HASH,
  analysisFingerprint: HASH,
  payloadHash: HASH,
  resultHash: HASH,
  dataQuality: 'complete',
  warningCount: 0,
  appVersion: '0.0.0',
};

function createOptions(): ExecuteCodexAnalysisOptions {
  return {
    username: 'alice',
    config: {
      model: 'app-default',
      reasoningEffort: 'model-default',
      startupTimeout: 10_000,
      turnTimeout: 600_000,
      shutdownGrace: 2000,
    },
    request: { systemPrompt: 'prompt', promptHash: HASH, payload: '{}' },
    analysisState: {
      schemaVersion: 2,
      providers: { key: { lastSentAnalysisFingerprint: HASH, lastSentPayloadHash: HASH } },
      currentResult: {
        analysisFingerprint: HASH,
        stale: false,
        basedOnPartial: false,
        deliveryMode: 'change',
        resultVersionId: null,
      },
    },
    provenance: {
      status: 'valid',
      analysisFingerprint: HASH,
      payloadHash: HASH,
      basedOnPartial: false,
    },
    savedResult: createAIAnalysisResultFixture(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readRegistry.mockReturnValue(REGISTRY);
  mocks.recoverSession.mockReturnValue({ status: 'completed' });
  mocks.resolveProject.mockReturnValue({ path: 'D:\\Data', source: 'storage' });
  mocks.selectModelRequest.mockReturnValue({ model: 'gpt-current', source: 'session' });
  mocks.discover.mockReturnValue({
    observations: [
      {
        candidate: CODEX_CANDIDATE,
        trust: {
          status: 'trusted',
          basis: 'windows-authenticode',
          publisher: 'OpenAI OpCo, LLC',
        },
      },
    ],
    launchCandidates: [CODEX_CANDIDATE],
  });
  mocks.selectRuntime.mockResolvedValue({
    candidate: CODEX_CANDIDATE,
    version: '0.144.5',
    model: { model: 'gpt-current', reasoningEffort: 'high' },
    connection: {
      startThread: vi.fn(),
      setThreadName: vi.fn(),
      resumeThread: vi.fn(),
      readThread: vi.fn(),
      runTurn: vi.fn(),
      close: mocks.close,
    },
  });
});

describe('executeCodexAnalysis', () => {
  it('should resolve the local runtime and close it after a reusable-result skip', async () => {
    mocks.hasReceived.mockReturnValue(true);
    mocks.runAnalysis.mockImplementation(async (options) => {
      expect(options.canReuseResult('provider-key')).toBe(true);
      return {
        status: 'skipped',
        providerKey: 'provider-key',
        registry: REGISTRY,
        state: STATE,
        model: 'gpt-current',
        reasoningEffort: 'high',
      };
    });

    const options = { ...createOptions(), proxyUrl: 'http://config-proxy.example' };
    await expect(executeCodexAnalysis(options)).resolves.toMatchObject({
      status: 'skipped',
      threadId: 'thread-1',
      model: 'gpt-current',
    });
    expect(mocks.assertProject).toHaveBeenCalledWith('D:\\Data');
    expect(mocks.selectRuntime).toHaveBeenCalledWith(
      [CODEX_CANDIDATE],
      expect.objectContaining({
        process: expect.objectContaining({ proxyUrl: 'http://config-proxy.example' }),
      }),
    );
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('should expose session completion only after returning a parsed result', async () => {
    const result = createAIAnalysisResultFixture();
    mocks.runAnalysis.mockResolvedValue({
      status: 'result',
      providerKey: 'provider-key',
      registry: REGISTRY,
      state: STATE,
      model: 'gpt-current',
      reasoningEffort: 'high',
      advance: {
        action: 'result',
        source: 'sent',
        completion: 'initial',
        registry: REGISTRY,
        state: STATE,
        thread: {
          id: 'thread-1',
          name: null,
          cwd: 'D:\\Data',
          status: { type: 'idle' },
          turns: [],
        },
        delivery: {
          deliveryId: 'delivery-1',
          providerKey: 'provider-key',
          analysisFingerprint: HASH,
          payloadHash: HASH,
          basedOnPartial: false,
          deliveryMode: 'change',
          reasoningEffort: 'high',
        },
        turn: { id: 'turn-analysis', status: 'completed', error: null, agentMessages: [] },
        message: { id: 'message-1', text: JSON.stringify(result), phase: 'final_answer' },
        result,
      },
    });

    const execution = await executeCodexAnalysis(createOptions());

    expect(execution.status).toBe('result');
    expect(mocks.activate).not.toHaveBeenCalled();
    if (execution.status !== 'result') throw new Error('Expected result execution');
    expect(execution).toMatchObject({
      threadName: 'alice-insight',
      delivery: { deliveryId: 'delivery-1' },
    });
    await execution.complete(RESULT_METADATA);
    expect(mocks.activate).toHaveBeenCalledWith(
      expect.objectContaining({ localSessionId: 'local-1', turnId: 'turn-analysis' }),
    );
    expect(mocks.recoverSession).toHaveBeenCalledWith({
      username: 'alice',
      metadata: RESULT_METADATA,
    });
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('should close the selected runtime when analysis execution fails', async () => {
    mocks.runAnalysis.mockRejectedValue(new Error('turn failed'));

    await expect(executeCodexAnalysis(createOptions())).rejects.toThrow('turn failed');
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

describe('inspectCodexResultDeliverySession', () => {
  const pending = {
    deliveryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    providerKey: `codex:${HASH}`,
    analysisFingerprint: HASH,
    payloadHash: HASH,
    inputSummaryHash: HASH,
    basedOnPartial: false,
    deliveryMode: 'change' as const,
    resultVersionId: 'v000001',
  };
  const registryWithPending: CodexThreadRegistryV1 = {
    ...REGISTRY,
    sessions: [
      {
        ...STATE,
        pendingAnalysis: {
          deliveryId: pending.deliveryId,
          providerKey: pending.providerKey,
          analysisFingerprint: pending.analysisFingerprint,
          payloadHash: pending.payloadHash,
          basedOnPartial: pending.basedOnPartial,
          deliveryMode: pending.deliveryMode,
          reasoningEffort: 'high',
          turnId: 'turn-analysis',
        },
      },
    ],
  };

  it('identifies a completed ready session', () => {
    expect(inspectCodexResultDeliverySession('alice', pending, 'local-1')).toBe('completed');
  });

  it('identifies the matching accepted pending turn', () => {
    mocks.readRegistry.mockReturnValue(registryWithPending);

    expect(inspectCodexResultDeliverySession('alice', pending, 'local-1')).toBe('pending');
  });

  it('rejects a missing or inconsistent recovery session', () => {
    expect(() => inspectCodexResultDeliverySession('alice', pending, 'missing')).toThrow(
      'was not found',
    );

    mocks.readRegistry.mockReturnValue(registryWithPending);
    expect(() =>
      inspectCodexResultDeliverySession(
        'alice',
        { ...pending, payloadHash: 'b'.repeat(64) },
        'local-1',
      ),
    ).toThrow('does not match its session');
  });

  it('rejects an unavailable or invalid session store', () => {
    mocks.readRegistry.mockImplementationOnce(() => {
      throw new Error('sessions/index.json is missing');
    });
    expect(() => inspectCodexResultDeliverySession('alice', pending, 'local-1')).toThrow(
      'sessions/index.json is missing',
    );

    mocks.readRegistry.mockImplementationOnce(() => {
      throw new Error('sessions/index.json is invalid or unreadable');
    });
    expect(() => inspectCodexResultDeliverySession('alice', pending, 'local-1')).toThrow(
      'invalid or unreadable',
    );
  });
});
