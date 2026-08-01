import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { createAIAnalysisResultFixture } from '@/core/ai/__tests__/result-fixture';
import { hashCanonicalJson } from '@/core/provenance/canonical-json';
import type {
  ResultVersionIndexV1,
  ResultVersionMetadata,
  StoredResultVersionV1,
} from '@/core/result-version';

const mocks = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeAtomic: vi.fn(),
  writeExclusive: vi.fn(),
}));

vi.mock('fs');
vi.mock('../reader', () => ({ readJsonFileResult: mocks.readJson }));
vi.mock('../writer', () => ({
  writeJsonFileAtomically: mocks.writeAtomic,
  writeJsonFileExclusively: mocks.writeExclusive,
}));
vi.mock('../result-version-paths', () => ({
  getResultVersionFilePath: (_username: string, versionId: string) =>
    `C:\\data\\alice\\results\\versions\\${versionId}.json`,
  getResultVersionFilesDir: () => 'C:\\data\\alice\\results\\versions',
  getResultVersionIndexPath: () => 'C:\\data\\alice\\results\\index.json',
}));

import {
  listStoredResultVersionIds,
  readResultVersionIndex,
  readStoredResultVersion,
  writeResultVersionIndex,
  writeStoredResultVersion,
} from '../result-version-files';

const HASH = 'a'.repeat(64);
const SAVED_AT = '2026-07-26T08:00:00.000Z';

function createMetadata(): ResultVersionMetadata {
  const result = createAIAnalysisResultFixture();
  return {
    versionId: 'v000001',
    sequence: 1,
    origin: 'analysis',
    deliveryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    previousLatestVersionId: null,
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
    appVersion: '1.0.0',
  };
}

function createVersion(): StoredResultVersionV1 {
  return {
    schemaVersion: 1,
    metadata: createMetadata(),
    result: createAIAnalysisResultFixture(),
  };
}

function createIndex(): ResultVersionIndexV1 {
  const metadata = createMetadata();
  return {
    schemaVersion: 1,
    nextSequence: 2,
    latestVersionId: metadata.versionId,
    versions: [metadata],
    updatedAt: SAVED_AT,
  };
}

describe('result version files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('distinguishes missing, invalid, and validated indexes', () => {
    mocks.readJson.mockReturnValueOnce({ status: 'missing' });
    expect(readResultVersionIndex('alice')).toEqual({ status: 'missing' });

    mocks.readJson.mockReturnValueOnce({ status: 'success', data: { schemaVersion: 1 } });
    expect(readResultVersionIndex('alice')).toEqual({ status: 'invalid' });

    const index = createIndex();
    mocks.readJson.mockReturnValueOnce({ status: 'success', data: index });
    expect(readResultVersionIndex('alice')).toEqual({ status: 'valid', index });
  });

  it('rejects a valid envelope stored under a different version ID', () => {
    const version = createVersion();
    mocks.readJson.mockReturnValue({ status: 'success', data: version });

    expect(readStoredResultVersion('alice', 'v000002')).toEqual({ status: 'invalid' });
    expect(readStoredResultVersion('alice', 'v000001')).toEqual({
      status: 'valid',
      version,
    });
  });

  it('publishes validated index and version values through separate write modes', () => {
    const index = createIndex();
    const version = createVersion();

    writeResultVersionIndex('alice', index);
    writeStoredResultVersion('alice', version);

    expect(mocks.writeAtomic).toHaveBeenCalledWith('C:\\data\\alice\\results\\index.json', index);
    expect(mocks.writeExclusive).toHaveBeenCalledWith(
      'C:\\data\\alice\\results\\versions\\v000001.json',
      version,
    );
  });

  it('rejects invalid values before filesystem writes', () => {
    expect(() => writeResultVersionIndex('alice', { ...createIndex(), nextSequence: 4 })).toThrow(
      TypeError,
    );
    expect(() =>
      writeStoredResultVersion('alice', {
        ...createVersion(),
        metadata: { ...createMetadata(), resultHash: 'b'.repeat(64) },
      }),
    ).toThrow(TypeError);
    expect(mocks.writeAtomic).not.toHaveBeenCalled();
    expect(mocks.writeExclusive).not.toHaveBeenCalled();
  });

  it('lists only canonical regular version files in sequence order', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'v1000000.json', isFile: () => true },
      { name: 'notes.json', isFile: () => true },
      { name: 'v000002.json', isFile: () => true },
      { name: 'v000001.json', isFile: () => true },
      { name: 'v000003.json', isFile: () => false },
      { name: 'v1.json', isFile: () => true },
    ] as never);

    expect(listStoredResultVersionIds('alice')).toEqual(['v000001', 'v000002', 'v1000000']);
  });
});
