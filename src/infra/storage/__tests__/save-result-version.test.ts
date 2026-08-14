import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { createAIAnalysisResultFixture } from '@/core/ai/__tests__/result-fixture';
import type { AIAnalysisResult } from '@/core/ai';
import type { PendingResultDeliveryState } from '@/core/provenance';
import type {
  ResultInputSummary,
  ResultVersionIndex,
  ResultVersionSource,
  StoredResultVersion,
} from '@/core/result-version';

const mocks = vi.hoisted(() => ({
  listIds: vi.fn(),
  readCurrent: vi.fn(),
  readIndex: vi.fn(),
  readStored: vi.fn(),
  withLock: vi.fn(),
  writeCurrent: vi.fn(),
  writeIndex: vi.fn(),
  writeStored: vi.fn(),
}));

vi.mock('fs');
vi.mock('../paths', () => ({
  getDataFilePath: () => 'C:\\data\\alice\\result.json',
}));
vi.mock('../reader', () => ({
  readDataFileResult: mocks.readCurrent,
}));
vi.mock('../writer', () => ({
  writeDataFile: mocks.writeCurrent,
}));
vi.mock('../result-version-files', () => ({
  listStoredResultVersionIds: mocks.listIds,
  readResultVersionIndex: mocks.readIndex,
  readStoredResultVersion: mocks.readStored,
  writeResultVersionIndex: mocks.writeIndex,
  writeStoredResultVersion: mocks.writeStored,
}));
vi.mock('../result-version-lock', () => ({
  withResultVersionLock: mocks.withLock,
}));

import { hashCanonicalJson } from '@/core/provenance/canonical-json';
import {
  recoverResultVersionDelivery,
  ResultVersionSaveError,
  saveResultVersion as saveResultVersionToStorage,
} from '../save-result-version';

const NOW = '2026-07-26T08:00:00.000Z';
const CREATED_AT = '2026-07-26T07:59:00.000Z';
const HASH = 'a'.repeat(64);
const DELIVERY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DELIVERY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let indexState:
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; index: ResultVersionIndex };
let currentState:
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'success'; data: unknown };
let versionFiles: Map<string, StoredResultVersion>;

function createSource(overrides: Partial<ResultVersionSource> = {}): ResultVersionSource {
  return {
    deliveryId: DELIVERY_A,
    origin: 'analysis',
    createdAt: CREATED_AT,
    provider: 'gemini',
    model: 'gemini-test',
    reasoningLevel: 'high',
    localSessionId: null,
    externalThreadId: null,
    threadName: null,
    promptHash: HASH,
    analysisFingerprint: HASH,
    payloadHash: HASH,
    dataQuality: 'complete',
    warningCount: 0,
    appVersion: '1.2.0',
    ...overrides,
  };
}

function createPending(
  overrides: Partial<PendingResultDeliveryState> = {},
): PendingResultDeliveryState {
  return {
    deliveryId: DELIVERY_A,
    providerKey: `gemini:${HASH}`,
    analysisFingerprint: HASH,
    payloadHash: HASH,
    inputSummaryHash: hashCanonicalJson(createInputSummary()),
    basedOnPartial: false,
    deliveryMode: 'change',
    resultVersionId: null,
    ...overrides,
  };
}

function createChangedResult(summary: string): AIAnalysisResult {
  return { ...createAIAnalysisResultFixture(), summary };
}

function createInputSummary(overrides: Partial<ResultInputSummary> = {}): ResultInputSummary {
  return {
    username: 'alice',
    analyzerConfig: { inactivityThresholdDays: 60, nodeDistributionTopN: 3 },
    dataQuality: {
      capturedAt: CREATED_AT,
      topics: { status: 'complete', totalExpected: 1, fetchedCount: 1, failedCount: 0 },
      replies: { status: 'complete', totalExpected: 1, fetchedCount: 1, failedCount: 0 },
    },
    userOverview: {
      joinDate: '2020-01-01',
      lastActiveTime: '2026-07-26',
      topicReplyRatio: 1,
      totalTopics: 1,
      totalReplies: 1,
      isTopicsHidden: false,
      dailyRanking: null,
    },
    activitySummary: { totalPeriods: 0, periods: [] },
    ...overrides,
  };
}

function saveResultVersion(
  username: string,
  result: AIAnalysisResult,
  source: ResultVersionSource,
  inputSummary: ResultInputSummary = createInputSummary({ username }),
) {
  return saveResultVersionToStorage(username, result, source, inputSummary);
}

function getIndex(): ResultVersionIndex {
  if (indexState.status !== 'valid') {
    throw new Error('Expected a persisted result version index');
  }
  return indexState.index;
}

function expectSaveError(operation: () => unknown, code: ResultVersionSaveError['code']): void {
  let didThrow = false;
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    didThrow = true;
    caught = error;
  }
  if (!didThrow) {
    throw new Error('Expected result version save error');
  }
  expect(caught).toBeInstanceOf(ResultVersionSaveError);
  expect((caught as ResultVersionSaveError).code).toBe(code);
}

function clearWriteCalls(): void {
  mocks.writeCurrent.mockClear();
  mocks.writeIndex.mockClear();
  mocks.writeStored.mockClear();
}

describe('saveResultVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    indexState = { status: 'missing' };
    currentState = { status: 'missing' };
    versionFiles = new Map();

    mocks.withLock.mockImplementation((_username: string, operation: () => unknown) => operation());
    mocks.readIndex.mockImplementation(() => indexState);
    mocks.readCurrent.mockImplementation(() => currentState);
    mocks.listIds.mockImplementation(() => [...versionFiles.keys()]);
    mocks.readStored.mockImplementation((_username: string, versionId: string) => {
      const version = versionFiles.get(versionId);
      return version ? { status: 'valid', version } : { status: 'missing' };
    });
    mocks.writeStored.mockImplementation((_username: string, version: StoredResultVersion) => {
      if (versionFiles.has(version.metadata.versionId)) {
        throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      }
      versionFiles.set(version.metadata.versionId, version);
    });
    mocks.writeCurrent.mockImplementation((_username: string, type: string, data: unknown) => {
      expect(type).toBe('result');
      currentState = { status: 'success', data };
    });
    mocks.writeIndex.mockImplementation((_username: string, index: ResultVersionIndex) => {
      indexState = { status: 'valid', index };
    });
    vi.mocked(fs.statSync).mockReturnValue({
      mtimeMs: new Date(CREATED_AT).getTime(),
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves the first result as v000001 and updates current before the index', () => {
    const result = createAIAnalysisResultFixture();

    const metadata = saveResultVersion('alice', result, createSource());

    expect(metadata.versionId).toBe('v000001');
    expect(metadata.resultHash).toBe(hashCanonicalJson(result));
    const stored = versionFiles.get('v000001');
    if (!stored) throw new Error('Expected the generated result version');
    expect(stored.result).toEqual(result);
    expect(stored.schemaVersion).toBe(1);
    expect(stored.inputSummary).toEqual(createInputSummary());
    expect(stored.inputSummaryHash).toBe(hashCanonicalJson(stored.inputSummary));
    expect(currentState).toEqual({ status: 'success', data: result });
    expect(getIndex()).toMatchObject({
      nextSequence: 2,
      latestVersionId: 'v000001',
      versions: [metadata],
    });
    expect(mocks.writeStored.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeCurrent.mock.invocationCallOrder[0] as number,
    );
    expect(mocks.writeCurrent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeIndex.mock.invocationCallOrder[0] as number,
    );
  });

  it('protects an existing current result before saving the new result', () => {
    const legacy = createChangedResult('Legacy result');
    const next = createChangedResult('New result');
    currentState = { status: 'success', data: legacy };

    const metadata = saveResultVersion('alice', next, createSource());

    expect(metadata.versionId).toBe('v000002');
    expect([...versionFiles.values()].map((version) => version.metadata.origin)).toEqual([
      'legacy',
      'analysis',
    ]);
    expect(versionFiles.get('v000001')?.metadata).toMatchObject({
      deliveryId: null,
      provider: 'unknown',
      createdAt: CREATED_AT,
      resultHash: hashCanonicalJson(legacy),
    });
    expect(versionFiles.get('v000001')).toMatchObject({
      schemaVersion: 1,
      inputSummary: null,
      inputSummaryHash: null,
    });
    expect(currentState).toEqual({ status: 'success', data: next });
  });

  it('protects an externally changed current result after versions already exist', () => {
    saveResultVersion('alice', createChangedResult('First'), createSource());
    currentState = { status: 'success', data: createChangedResult('External') };
    clearWriteCalls();

    const metadata = saveResultVersion(
      'alice',
      createChangedResult('Second'),
      createSource({ deliveryId: DELIVERY_B }),
    );

    expect(metadata.versionId).toBe('v000003');
    expect([...versionFiles.values()].map((version) => version.metadata.origin)).toEqual([
      'analysis',
      'untracked-current',
      'analysis',
    ]);
  });

  it('returns the existing version for an identical committed delivery', () => {
    const result = createAIAnalysisResultFixture();
    const source = createSource();
    const first = saveResultVersion('alice', result, source);
    clearWriteCalls();

    const repeated = saveResultVersion('alice', result, source);

    expect(repeated).toEqual(first);
    expect(mocks.writeStored).not.toHaveBeenCalled();
    expect(mocks.writeIndex).not.toHaveBeenCalled();
    expect(mocks.writeCurrent).not.toHaveBeenCalled();
  });

  it('rejects a reused delivery ID with different result content', () => {
    saveResultVersion('alice', createChangedResult('First'), createSource());
    clearWriteCalls();

    expectSaveError(
      () => saveResultVersion('alice', createChangedResult('Different'), createSource()),
      'RESULT_DELIVERY_CONFLICT',
    );
    expect(mocks.writeStored).not.toHaveBeenCalled();
  });

  it('restores a missing current result for an identical committed delivery', () => {
    const result = createAIAnalysisResultFixture();
    const source = createSource();
    saveResultVersion('alice', result, source);
    currentState = { status: 'missing' };
    clearWriteCalls();

    expect(saveResultVersion('alice', result, source).versionId).toBe('v000001');
    expect(currentState).toEqual({ status: 'success', data: result });
    expect(mocks.writeCurrent).toHaveBeenCalledOnce();
    expect(mocks.writeIndex).not.toHaveBeenCalled();
  });

  it('recovers a committed delivery from its durable pending identity', () => {
    const result = createAIAnalysisResultFixture();
    saveResultVersion('alice', result, createSource());
    currentState = { status: 'missing' };
    clearWriteCalls();

    const recovered = recoverResultVersionDelivery('alice', createPending());

    expect(recovered).toEqual({
      status: 'recovered',
      metadata: getIndex().versions[0],
      result,
    });
    expect(currentState).toEqual({ status: 'success', data: result });
    expect(mocks.writeCurrent).toHaveBeenCalledOnce();
    expect(mocks.writeStored).not.toHaveBeenCalled();
    expect(mocks.writeIndex).not.toHaveBeenCalled();
  });

  it('recovers an unindexed delivery candidate from pending state', () => {
    const result = createAIAnalysisResultFixture();
    mocks.writeIndex.mockImplementationOnce(() => {
      throw new Error('index write failed');
    });
    expect(() => saveResultVersion('alice', result, createSource())).toThrow('index write failed');
    clearWriteCalls();

    const recovered = recoverResultVersionDelivery('alice', createPending());

    expect(recovered.status).toBe('recovered');
    expect(getIndex().latestVersionId).toBe('v000001');
    expect(versionFiles.size).toBe(1);
    expect(mocks.writeCurrent).not.toHaveBeenCalled();
    expect(mocks.writeIndex).toHaveBeenCalledOnce();
  });

  it('rejects an unindexed candidate with a different input summary', () => {
    const result = createAIAnalysisResultFixture();
    mocks.writeIndex.mockImplementationOnce(() => {
      throw new Error('index write failed');
    });
    expect(() => saveResultVersion('alice', result, createSource())).toThrow('index write failed');
    clearWriteCalls();

    expectSaveError(
      () =>
        recoverResultVersionDelivery('alice', createPending({ inputSummaryHash: 'b'.repeat(64) })),
      'RESULT_DELIVERY_CONFLICT',
    );
    expect(mocks.writeCurrent).not.toHaveBeenCalled();
    expect(mocks.writeIndex).not.toHaveBeenCalled();
  });

  it('returns missing when a pending delivery has no saved file', () => {
    expect(recoverResultVersionDelivery('alice', createPending())).toEqual({
      status: 'missing',
    });
    expect(mocks.writeStored).not.toHaveBeenCalled();
    expect(mocks.writeCurrent).not.toHaveBeenCalled();
    expect(mocks.writeIndex).not.toHaveBeenCalled();
  });

  it('rejects pending identity that conflicts with a saved delivery', () => {
    saveResultVersion('alice', createAIAnalysisResultFixture(), createSource());
    clearWriteCalls();

    expectSaveError(
      () =>
        recoverResultVersionDelivery(
          'alice',
          createPending({ analysisFingerprint: 'b'.repeat(64) }),
        ),
      'RESULT_DELIVERY_CONFLICT',
    );
    expect(mocks.writeCurrent).not.toHaveBeenCalled();
    expect(mocks.writeIndex).not.toHaveBeenCalled();
  });

  it('recovers a candidate when current still matches the previous state', () => {
    const result = createAIAnalysisResultFixture();
    const source = createSource();
    mocks.writeCurrent.mockImplementationOnce(() => {
      throw new Error('current write failed');
    });

    expect(() => saveResultVersion('alice', result, source)).toThrow('current write failed');
    expect(indexState).toEqual({ status: 'missing' });
    expect(versionFiles.has('v000001')).toBe(true);

    saveResultVersion('alice', result, source);

    expect(currentState).toEqual({ status: 'success', data: result });
    expect(getIndex().latestVersionId).toBe('v000001');
    expect(versionFiles.size).toBe(1);
  });

  it('completes the index when current already matches the candidate', () => {
    const result = createAIAnalysisResultFixture();
    const source = createSource();
    mocks.writeIndex.mockImplementationOnce(() => {
      throw new Error('index write failed');
    });

    expect(() => saveResultVersion('alice', result, source)).toThrow('index write failed');
    expect(currentState).toEqual({ status: 'success', data: result });
    clearWriteCalls();

    saveResultVersion('alice', result, source);

    expect(getIndex().latestVersionId).toBe('v000001');
    expect(mocks.writeCurrent).not.toHaveBeenCalled();
    expect(mocks.writeStored).not.toHaveBeenCalled();
    expect(mocks.writeIndex).toHaveBeenCalledOnce();
  });

  it('recovers a protected current candidate before saving the requested delivery', () => {
    const legacy = createChangedResult('Legacy result');
    const next = createChangedResult('New result');
    currentState = { status: 'success', data: legacy };
    mocks.writeIndex.mockImplementationOnce(() => {
      throw new Error('index write failed');
    });

    expect(() => saveResultVersion('alice', next, createSource())).toThrow('index write failed');
    expect(versionFiles.get('v000001')?.metadata.origin).toBe('legacy');
    expect(indexState).toEqual({ status: 'missing' });

    const metadata = saveResultVersion('alice', next, createSource());

    expect(metadata.versionId).toBe('v000002');
    expect([...versionFiles.values()].map((version) => version.metadata.origin)).toEqual([
      'legacy',
      'analysis',
    ]);
    expect(getIndex().latestVersionId).toBe('v000002');
  });

  it('blocks a different delivery while an unindexed candidate exists', () => {
    mocks.writeCurrent.mockImplementationOnce(() => {
      throw new Error('current write failed');
    });
    expect(() => saveResultVersion('alice', createChangedResult('First'), createSource())).toThrow(
      'current write failed',
    );

    expectSaveError(
      () =>
        saveResultVersion(
          'alice',
          createChangedResult('Second'),
          createSource({ deliveryId: DELIVERY_B }),
        ),
      'RESULT_DELIVERY_CONFLICT',
    );
    expect(versionFiles.size).toBe(1);
  });

  it('preserves a divergent current result beside an unindexed candidate', () => {
    const source = createSource();
    mocks.writeIndex.mockImplementationOnce(() => {
      throw new Error('index write failed');
    });
    expect(() => saveResultVersion('alice', createChangedResult('Candidate'), source)).toThrow(
      'index write failed',
    );
    currentState = { status: 'success', data: createChangedResult('External') };

    expectSaveError(
      () => saveResultVersion('alice', createChangedResult('Candidate'), source),
      'RESULT_CURRENT_DIVERGED',
    );
    expect(versionFiles.size).toBe(1);
    expect(currentState).toEqual({
      status: 'success',
      data: createChangedResult('External'),
    });
  });

  it('rejects an index whose immutable version file is missing', () => {
    saveResultVersion('alice', createChangedResult('First'), createSource());
    versionFiles.clear();
    clearWriteCalls();

    expectSaveError(
      () =>
        saveResultVersion(
          'alice',
          createChangedResult('Second'),
          createSource({ deliveryId: DELIVERY_B }),
        ),
      'RESULT_VERSION_CORRUPT',
    );
    expect(mocks.writeStored).not.toHaveBeenCalled();
    expect(mocks.writeCurrent).not.toHaveBeenCalled();
    expect(mocks.writeIndex).not.toHaveBeenCalled();
  });

  it('rejects invalid current or index state without writing', () => {
    currentState = { status: 'invalid' };
    expectSaveError(
      () => saveResultVersion('alice', createAIAnalysisResultFixture(), createSource()),
      'RESULT_CURRENT_INVALID',
    );

    currentState = { status: 'missing' };
    indexState = { status: 'invalid' };
    expectSaveError(
      () => saveResultVersion('alice', createAIAnalysisResultFixture(), createSource()),
      'RESULT_VERSION_CORRUPT',
    );
  });

  it('rejects an input summary owned by a different user before locking', () => {
    expect(() =>
      saveResultVersion(
        'alice',
        createAIAnalysisResultFixture(),
        createSource(),
        createInputSummary({ username: 'bob' }),
      ),
    ).toThrow(TypeError);
    expect(mocks.withLock).not.toHaveBeenCalled();
  });
});
