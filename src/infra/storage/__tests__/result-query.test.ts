import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAIAnalysisResultFixture } from '@/core/ai/__tests__/result-fixture';
import type { AIAnalysisResult } from '@/core/ai';
import { hashCanonicalJson, type CurrentResultState } from '@/core/provenance';
import type {
  ResultInputSummary,
  ResultVersionIndex,
  ResultVersionMetadata,
  StoredResultVersion,
} from '@/core/result-version';

const mocks = vi.hoisted(() => ({
  listIds: vi.fn(),
  readJson: vi.fn(),
  readLock: vi.fn(),
}));

vi.mock('../read-state', () => ({ readJsonFileSnapshot: mocks.readJson }));
vi.mock('../result-version-files', () => ({ listStoredResultVersionIds: mocks.listIds }));
vi.mock('../result-version-lock', () => ({ readResultVersionLock: mocks.readLock }));
vi.mock('../paths', () => ({
  getDataFilePath: (_username: string, type: string) => `C:\\data\\alice\\${type}.json`,
}));
vi.mock('../result-version-paths', () => ({
  getResultVersionIndexPath: () => 'C:\\data\\alice\\results\\index.json',
  getResultVersionFilePath: (_username: string, versionId: string) =>
    `C:\\data\\alice\\results\\versions\\${versionId}.json`,
}));

import { queryCurrentResult } from '../result-query';
import { queryResultHistory, queryResultVersion } from '../result-history-query';

const RESULT_PATH = 'C:\\data\\alice\\result.json';
const ANALYSIS_STATE_PATH = 'C:\\data\\alice\\analysisState.json';
const INDEX_PATH = 'C:\\data\\alice\\results\\index.json';
const SAVED_AT = '2026-08-13T02:00:00.000Z';
const HASH = 'a'.repeat(64);

type MockFile =
  | { status: 'value'; value: unknown }
  | { status: 'invalid'; reason: 'json' | 'contract' }
  | { status: 'unreadable'; error: unknown };

let files: Map<string, MockFile>;
let candidateIds: string[];

function getVersionPath(versionId: string): string {
  return `C:\\data\\alice\\results\\versions\\${versionId}.json`;
}

function createInputSummary(): ResultInputSummary {
  return {
    username: 'alice',
    analyzerConfig: { inactivityThresholdDays: 60, nodeDistributionTopN: 3 },
    dataQuality: {
      capturedAt: SAVED_AT,
      topics: { status: 'complete', totalExpected: 0, fetchedCount: 0, failedCount: 0 },
      replies: { status: 'complete', totalExpected: 0, fetchedCount: 0, failedCount: 0 },
    },
    userOverview: {
      joinDate: '2020-01-01',
      lastActiveTime: '2026-08-12',
      topicReplyRatio: null,
      totalTopics: 0,
      totalReplies: 0,
      isTopicsHidden: false,
      dailyRanking: null,
    },
    activitySummary: { totalPeriods: 0, periods: [] },
  };
}

function createMetadata(
  sequence: number,
  result: AIAnalysisResult,
  previousLatestVersionId: string | null,
): ResultVersionMetadata {
  const versionId = `v${String(sequence).padStart(6, '0')}`;
  const deliveryPrefix = sequence === 1 ? 'a' : 'b';
  return {
    versionId,
    sequence,
    origin: 'analysis',
    deliveryId: `${deliveryPrefix.repeat(8)}-${deliveryPrefix.repeat(4)}-4${deliveryPrefix.repeat(3)}-8${deliveryPrefix.repeat(3)}-${deliveryPrefix.repeat(12)}`,
    previousLatestVersionId,
    previousCurrentHash: null,
    createdAt: SAVED_AT,
    savedAt: SAVED_AT,
    provider: 'gemini',
    model: 'gemini-test',
    reasoningLevel: 'high',
    localSessionId: null,
    externalThreadId: null,
    threadName: null,
    promptHash: HASH,
    analysisFingerprint: HASH,
    payloadHash: HASH,
    resultHash: hashCanonicalJson(result),
    dataQuality: 'complete',
    warningCount: 0,
    appVersion: '1.2.0',
  };
}

function createVersion(
  metadata: ResultVersionMetadata,
  result: AIAnalysisResult,
): StoredResultVersion {
  const inputSummary = createInputSummary();
  return {
    schemaVersion: 1,
    metadata,
    inputSummary,
    inputSummaryHash: hashCanonicalJson(inputSummary),
    result,
  };
}

function installArchive(results: AIAnalysisResult[]): ResultVersionMetadata[] {
  const metadata = results.map((result, index) =>
    createMetadata(index + 1, result, index === 0 ? null : `v${String(index).padStart(6, '0')}`),
  );
  const index: ResultVersionIndex = {
    schemaVersion: 1,
    nextSequence: metadata.length + 1,
    latestVersionId: metadata[metadata.length - 1]?.versionId ?? null,
    versions: metadata,
    updatedAt: SAVED_AT,
  };
  files.set(INDEX_PATH, { status: 'value', value: index });
  for (const [position, entry] of metadata.entries()) {
    const result = results[position];
    if (!result) throw new Error(`Missing result fixture for ${entry.versionId}`);
    files.set(getVersionPath(entry.versionId), {
      status: 'value',
      value: createVersion(entry, result),
    });
  }
  candidateIds = metadata.map(({ versionId }) => versionId);
  return metadata;
}

function installAnalysisState(
  versionId: string,
  overrides: Partial<CurrentResultState> = {},
): void {
  files.set(ANALYSIS_STATE_PATH, {
    status: 'value',
    value: {
      schemaVersion: 2,
      currentResult: {
        analysisFingerprint: HASH,
        stale: true,
        basedOnPartial: false,
        deliveryMode: 'change',
        resultVersionId: versionId,
        ...overrides,
      },
    },
  });
}

function installReadMock(identityForPath?: (path: string) => string | undefined): void {
  mocks.readJson.mockImplementation(
    (path: string, parse: (value: unknown) => unknown | undefined) => {
      const file = files.get(path);
      if (!file) return { state: { status: 'missing' }, identity: 'missing' };
      if (file.status === 'invalid') {
        return {
          state: { status: 'invalid', reason: file.reason },
          identity: identityForPath?.(path) ?? `invalid:${path}`,
        };
      }
      if (file.status === 'unreadable') {
        return {
          state: { status: 'unreadable', error: file.error },
          identity: identityForPath?.(path) ?? `unreadable:${path}`,
        };
      }
      const parsed = parse(file.value);
      return parsed === undefined
        ? {
            state: { status: 'invalid', reason: 'contract' },
            identity: identityForPath?.(path) ?? hashCanonicalJson(file.value),
          }
        : {
            state: { status: 'valid', value: parsed },
            identity: identityForPath?.(path) ?? hashCanonicalJson(file.value),
          };
    },
  );
}

describe('queryCurrentResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    files = new Map();
    candidateIds = [];
    mocks.listIds.mockImplementation(() => candidateIds);
    mocks.readLock.mockReturnValue({ status: 'missing' });
    installReadMock();
  });

  it('returns metadata, input facts, and dynamic state only for a verified current result', () => {
    const result = createAIAnalysisResultFixture();
    files.set(RESULT_PATH, { status: 'value', value: result });
    const [metadata] = installArchive([result]);
    if (!metadata) throw new Error('Missing result metadata fixture');
    installAnalysisState(metadata.versionId);

    const query = queryCurrentResult('alice');

    expect(query.status).toBe('selected');
    if (query.status !== 'selected') return;
    expect(query.selection).toMatchObject({
      archiveState: 'verified-current',
      provenanceState: 'verified',
      isLatest: true,
      metadata: { versionId: 'v000001' },
      inputSummary: { username: 'alice' },
      verifiedCurrentResult: { stale: true, resultVersionId: 'v000001' },
    });
  });

  it('keeps missing, invalid-contract, and unreadable current results distinct', () => {
    expect(queryCurrentResult('alice')).toEqual({ status: 'missing', latestVersionId: null });

    files.set(RESULT_PATH, { status: 'value', value: { summary: 'incomplete' } });
    expect(queryCurrentResult('alice')).toEqual({ status: 'invalid', reason: 'contract' });

    const error = Object.assign(new Error('denied'), { code: 'EACCES' });
    files.set(RESULT_PATH, { status: 'unreadable', error });
    expect(queryCurrentResult('alice')).toEqual({
      status: 'invalid',
      reason: 'unreadable',
      error,
    });
  });

  it('classifies legacy, non-latest, untracked, and unavailable current relationships', () => {
    const current = createAIAnalysisResultFixture();
    const latest = { ...createAIAnalysisResultFixture(), summary: 'Latest result' };
    files.set(RESULT_PATH, { status: 'value', value: current });
    expect(queryCurrentResult('alice')).toMatchObject({
      status: 'selected',
      selection: { archiveState: 'legacy-current' },
    });

    const metadata = installArchive([current, latest]);
    const currentMetadata = metadata[0];
    if (!currentMetadata) throw new Error('Missing current metadata fixture');
    installAnalysisState(currentMetadata.versionId);
    expect(queryCurrentResult('alice')).toMatchObject({
      status: 'selected',
      selection: {
        archiveState: 'tracked-current-diverged',
        metadata: { versionId: 'v000001' },
      },
    });

    files.set(RESULT_PATH, {
      status: 'value',
      value: { ...createAIAnalysisResultFixture(), summary: 'Manual result' },
    });
    expect(queryCurrentResult('alice')).toMatchObject({
      status: 'selected',
      selection: { archiveState: 'untracked-current', metadata: null },
    });

    candidateIds = [...candidateIds, 'v000003'];
    expect(queryCurrentResult('alice')).toMatchObject({
      status: 'selected',
      selection: { archiveState: 'unavailable', metadata: null },
    });
  });

  it('does not expose stale or partial state when provenance points elsewhere', () => {
    const result = createAIAnalysisResultFixture();
    files.set(RESULT_PATH, { status: 'value', value: result });
    installArchive([result]);
    installAnalysisState('v000002', { basedOnPartial: true });

    expect(queryCurrentResult('alice')).toMatchObject({
      status: 'selected',
      selection: {
        archiveState: 'verified-current',
        provenanceState: 'mismatched',
        verifiedCurrentResult: null,
      },
    });
  });

  it('returns busy for a changing snapshot or a locked cross-file divergence', () => {
    const result = createAIAnalysisResultFixture();
    files.set(RESULT_PATH, { status: 'value', value: result });
    let currentRead = 0;
    installReadMock((path) => (path === RESULT_PATH ? `current:${currentRead++}` : undefined));
    expect(queryCurrentResult('alice')).toEqual({ status: 'busy' });

    installReadMock();
    const latest = { ...result, summary: 'Latest result' };
    installArchive([latest]);
    mocks.readLock.mockReturnValue({
      status: 'locked',
      owner: {
        schemaVersion: 1,
        pid: 123,
        acquiredAt: SAVED_AT,
        token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    });
    expect(queryCurrentResult('alice')).toEqual({ status: 'busy' });
  });

  it('lists verified history in reverse sequence order without reading current data', () => {
    const first = createAIAnalysisResultFixture();
    const second = { ...createAIAnalysisResultFixture(), summary: 'Second result' };
    installArchive([first, second]);

    const query = queryResultHistory('alice');

    expect(query).toMatchObject({
      status: 'success',
      summaries: [
        { versionId: 'v000002', isLatest: true, inputSummaryAvailable: true },
        { versionId: 'v000001', isLatest: false, inputSummaryAvailable: true },
      ],
    });
    const paths = mocks.readJson.mock.calls.map(([path]) => path);
    expect(paths).not.toContain(RESULT_PATH);
    expect(paths).not.toContain(ANALYSIS_STATE_PATH);
  });

  it('selects only indexed versions without reading current or provenance files', () => {
    const first = createAIAnalysisResultFixture();
    const second = { ...createAIAnalysisResultFixture(), summary: 'Second result' };
    installArchive([first, second]);

    const query = queryResultVersion('alice', 'v000001');

    expect(query).toMatchObject({
      status: 'selected',
      selection: {
        source: 'version',
        archiveState: 'verified-history',
        metadata: { versionId: 'v000001' },
        isLatest: false,
      },
    });
    const paths = mocks.readJson.mock.calls.map(([path]) => path);
    expect(paths).not.toContain(RESULT_PATH);
    expect(paths).not.toContain(ANALYSIS_STATE_PATH);
    expect(paths).not.toContain(getVersionPath('v000002'));
  });

  it('exposes a read-only virtual legacy history and version', () => {
    const result = createAIAnalysisResultFixture();
    files.set(RESULT_PATH, { status: 'value', value: result });

    expect(queryResultHistory('alice')).toMatchObject({
      status: 'success',
      summaries: [
        {
          versionId: 'v000001',
          origin: 'legacy',
          provider: 'unknown',
          virtual: true,
          inputSummaryAvailable: false,
        },
      ],
    });
    expect(queryResultVersion('alice', 'v000001')).toMatchObject({
      status: 'selected',
      selection: { source: 'legacy', archiveState: 'legacy-current', result },
    });
  });

  it('rejects a noncanonical version ID before resolving storage paths', () => {
    expect(queryResultVersion('alice', 'v1')).toEqual({ status: 'not-found' });
    expect(mocks.readJson).not.toHaveBeenCalled();
    expect(mocks.listIds).not.toHaveBeenCalled();
    expect(mocks.readLock).not.toHaveBeenCalled();
  });

  it('fails closed for damaged or unindexed archive entries and reports an active writer', () => {
    const result = createAIAnalysisResultFixture();
    installArchive([result]);
    files.delete(getVersionPath('v000001'));
    expect(queryResultHistory('alice')).toEqual({ status: 'corrupt', reason: 'missing' });

    files.set(getVersionPath('v000001'), {
      status: 'value',
      value: createVersion(createMetadata(1, result, null), result),
    });
    candidateIds = [...candidateIds, 'v000009'];
    files.set(getVersionPath('v000009'), {
      status: 'value',
      value: createVersion(createMetadata(9, result, 'v000008'), result),
    });
    expect(queryResultVersion('alice', 'v000009')).toEqual({
      status: 'corrupt',
      reason: 'mismatched',
    });

    mocks.readLock.mockReturnValue({
      status: 'locked',
      owner: {
        schemaVersion: 1,
        pid: 123,
        acquiredAt: SAVED_AT,
        token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    });
    expect(queryResultHistory('alice')).toEqual({ status: 'busy' });
  });
});
