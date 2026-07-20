import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAIAnalysisResultFixture } from '@/core/ai/__tests__/result-fixture';
import type { CodexThreadRegistryV1, CodexThreadState } from '@/core/ai/providers/codex';

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  assertProject: vi.fn(),
  close: vi.fn(),
  complete: vi.fn(),
  discover: vi.fn(),
  hasReceived: vi.fn(),
  readRegistry: vi.fn(),
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
  readCodexThreadRegistry: mocks.readRegistry,
  updateCodexThreadRegistry: mocks.updateRegistry,
}));

import { executeCodexAnalysis, type ExecuteCodexAnalysisOptions } from '../codex';

const HASH = 'a'.repeat(64);
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
      schemaVersion: 1,
      providers: { key: { lastSentAnalysisFingerprint: HASH, lastSentPayloadHash: HASH } },
      currentResult: {
        analysisFingerprint: HASH,
        stale: false,
        basedOnPartial: false,
        deliveryMode: 'change',
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
  mocks.readRegistry.mockReturnValue({ status: 'valid', registry: REGISTRY });
  mocks.resolveProject.mockReturnValue({ path: 'D:\\Data', source: 'storage' });
  mocks.selectModelRequest.mockReturnValue({ model: 'gpt-current', source: 'session' });
  mocks.discover.mockReturnValue([
    { path: 'C:\\App\\codex.exe', source: 'app-bundle', kind: 'native' },
  ]);
  mocks.selectRuntime.mockResolvedValue({
    candidate: { path: 'C:\\App\\codex.exe', source: 'app-bundle', kind: 'native' },
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

    await expect(executeCodexAnalysis(createOptions())).resolves.toMatchObject({
      status: 'skipped',
      threadId: 'thread-1',
      model: 'gpt-current',
    });
    expect(mocks.assertProject).toHaveBeenCalledWith('D:\\Data');
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
    await execution.complete();
    expect(mocks.activate).toHaveBeenCalledWith(
      expect.objectContaining({ localSessionId: 'local-1', turnId: 'turn-analysis' }),
    );
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('should close the selected runtime when analysis execution fails', async () => {
    mocks.runAnalysis.mockRejectedValue(new Error('turn failed'));

    await expect(executeCodexAnalysis(createOptions())).rejects.toThrow('turn failed');
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
