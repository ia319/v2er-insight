import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('fs');
vi.mock('os');

const mockedFs = vi.mocked(fs);
const mockedOs = vi.mocked(os);

const mockHomeDir = '/mock/home';
const mockDataBase = path.join(mockHomeDir, '.v2er-insight', 'data');

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------

describe('storage/paths', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockedOs.homedir.mockReturnValue(mockHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDataRootDir', () => {
    it('should return the shared data directory path', async () => {
      const { getDataRootDir } = await import('../paths');
      expect(getDataRootDir()).toBe(mockDataBase);
    });
  });

  describe('getUserDataDir', () => {
    it('should return user data directory path', async () => {
      const { getUserDataDir } = await import('../paths');
      const result = getUserDataDir('livid');
      expect(result).toBe(path.join(mockDataBase, 'livid'));
    });
  });

  describe('getDataFilePath', () => {
    it('should return raw.json path', async () => {
      const { getDataFilePath } = await import('../paths');
      expect(getDataFilePath('livid', 'raw')).toBe(path.join(mockDataBase, 'livid', 'raw.json'));
    });

    it('should return analyzed.json path', async () => {
      const { getDataFilePath } = await import('../paths');
      expect(getDataFilePath('livid', 'analyzed')).toBe(
        path.join(mockDataBase, 'livid', 'analyzed.json'),
      );
    });

    it('should return result.json path', async () => {
      const { getDataFilePath } = await import('../paths');
      expect(getDataFilePath('livid', 'result')).toBe(
        path.join(mockDataBase, 'livid', 'result.json'),
      );
    });

    it('should return analysis-state.json path', async () => {
      const { getDataFilePath } = await import('../paths');
      expect(getDataFilePath('livid', 'analysisState')).toBe(
        path.join(mockDataBase, 'livid', 'analysis-state.json'),
      );
    });

    it('should return codex-sessions.json path', async () => {
      const { getDataFilePath } = await import('../paths');
      expect(getDataFilePath('livid', 'codexSessions')).toBe(
        path.join(mockDataBase, 'livid', 'codex-sessions.json'),
      );
    });
  });

  describe('username validation', () => {
    it('should accept valid usernames (letters, digits, underscore, hyphen)', async () => {
      const { getUserDataDir } = await import('../paths');
      expect(() => getUserDataDir('livid')).not.toThrow();
      expect(() => getUserDataDir('test_user-01')).not.toThrow();
    });

    it('should reject path traversal attempts', async () => {
      const { getUserDataDir } = await import('../paths');
      expect(() => getUserDataDir('../../../etc')).toThrow('非法字符');
    });

    it('should reject usernames with special characters', async () => {
      const { getUserDataDir } = await import('../paths');
      expect(() => getUserDataDir('user name')).toThrow('非法字符');
      expect(() => getUserDataDir('user/name')).toThrow('非法字符');
      expect(() => getUserDataDir('')).toThrow('非法字符');
    });
  });
});

// ---------------------------------------------------------------------------
// reader
// ---------------------------------------------------------------------------

describe('storage/reader', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockedOs.homedir.mockReturnValue(mockHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readDataFile', () => {
    it('should return null when file does not exist', async () => {
      mockedFs.readFileSync.mockImplementation(() => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      });
      const { readDataFile } = await import('../reader');

      expect(readDataFile('livid', 'raw')).toBeNull();
    });

    it('should return parsed object when file exists', async () => {
      mockedFs.readFileSync.mockReturnValue('{"topics":[],"replies":[]}');
      const { readDataFile } = await import('../reader');

      const result = readDataFile<{ topics: unknown[]; replies: unknown[] }>('livid', 'raw');
      expect(result).toEqual({ topics: [], replies: [] });
    });

    it('should return null on JSON parse error', async () => {
      mockedFs.readFileSync.mockReturnValue('invalid json');
      const { readDataFile } = await import('../reader');

      expect(readDataFile('livid', 'raw')).toBeNull();
    });

    it('should preserve invalid JSON as a distinct detailed read result', async () => {
      mockedFs.readFileSync.mockReturnValue('invalid json');
      const { readDataFileResult } = await import('../reader');

      expect(readDataFileResult('livid', 'analysisState')).toEqual({ status: 'invalid' });
    });
  });
});

// ---------------------------------------------------------------------------
// writer
// ---------------------------------------------------------------------------

describe('storage/writer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockedOs.homedir.mockReturnValue(mockHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('writeDataFile', () => {
    it('should atomically replace the target with formatted JSON', async () => {
      mockedFs.mkdirSync.mockImplementation(() => '' as never);
      mockedFs.writeFileSync.mockImplementation(() => {});
      mockedFs.renameSync.mockImplementation(() => {});
      const { writeDataFile } = await import('../writer');

      const data = { topics: [1, 2, 3] };
      writeDataFile('livid', 'raw', data);

      // mkdirSync 始终调用，recursive: true 已处理目录存在的情况
      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(path.join(mockDataBase, 'livid'), {
        recursive: true,
      });
      const tempPath = mockedFs.writeFileSync.mock.calls[0]?.[0];
      expect(tempPath).toEqual(expect.stringContaining('.raw.json.'));
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(tempPath, JSON.stringify(data, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
        flag: 'wx',
      });
      expect(mockedFs.renameSync).toHaveBeenCalledWith(
        tempPath,
        path.join(mockDataBase, 'livid', 'raw.json'),
      );
    });

    it('should write compact JSON when pretty is false', async () => {
      mockedFs.mkdirSync.mockImplementation(() => '' as never);
      mockedFs.writeFileSync.mockImplementation(() => {});
      mockedFs.renameSync.mockImplementation(() => {});
      const { writeDataFile } = await import('../writer');

      const data = { a: 1 };
      writeDataFile('livid', 'raw', data, { pretty: false });

      const tempPath = mockedFs.writeFileSync.mock.calls[0]?.[0];
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(tempPath, JSON.stringify(data), {
        encoding: 'utf-8',
        mode: 0o600,
        flag: 'wx',
      });
    });

    it('should remove the temporary file and preserve the error when replacement fails', async () => {
      mockedFs.mkdirSync.mockImplementation(() => '' as never);
      mockedFs.writeFileSync.mockImplementation(() => {});
      mockedFs.renameSync.mockImplementation(() => {
        throw new Error('rename failed');
      });
      mockedFs.unlinkSync.mockImplementation(() => {});
      const { writeDataFile } = await import('../writer');

      expect(() => writeDataFile('livid', 'raw', { a: 1 })).toThrow('rename failed');

      const tempPath = mockedFs.writeFileSync.mock.calls[0]?.[0];
      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(tempPath);
    });
  });

  describe('writeDataFileWithRollback', () => {
    it('should restore the previous file content when the dependent write fails', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('{"summary":"previous"}');
      mockedFs.mkdirSync.mockImplementation(() => '' as never);
      mockedFs.writeFileSync.mockImplementation(() => {});
      mockedFs.renameSync.mockImplementation(() => {});
      const { DataFilePostWriteError, writeDataFileWithRollback } = await import('../writer');

      expect(() =>
        writeDataFileWithRollback('livid', 'result', { summary: 'next' }, () => {
          throw new Error('state write failed');
        }),
      ).toThrow(DataFilePostWriteError);

      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(mockedFs.writeFileSync.mock.calls[1]?.[1]).toBe('{"summary":"previous"}');
      expect(mockedFs.renameSync).toHaveBeenCalledTimes(2);
    });

    it('should remove a newly created file after the restore source disappears', async () => {
      mockedFs.readFileSync.mockImplementation(() => {
        throw Object.assign(new Error('file disappeared'), { code: 'ENOENT' });
      });
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.mkdirSync.mockImplementation(() => '' as never);
      mockedFs.writeFileSync.mockImplementation(() => {});
      mockedFs.renameSync.mockImplementation(() => {});
      mockedFs.unlinkSync.mockImplementation(() => {});
      const { writeDataFileWithRollback } = await import('../writer');

      expect(() =>
        writeDataFileWithRollback('livid', 'result', { summary: 'next' }, () => {
          throw new Error('state write failed');
        }),
      ).toThrow('state write failed');

      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(
        path.join(mockDataBase, 'livid', 'result.json'),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// cleaner
// ---------------------------------------------------------------------------

describe('storage/cleaner', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockedOs.homedir.mockReturnValue(mockHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 辅助函数：mock getConfig 返回指定配置
   */
  function mockConfig(data: { keepRaw?: boolean; rawRetention?: number }) {
    vi.doMock('@/config', async () => {
      const actual = await vi.importActual<typeof import('@/config')>('@/config');
      return {
        ...actual,
        getConfig: () => ({ data }),
      };
    });
  }

  /**
   * 辅助函数：构造指定天数前的 mtime
   */
  function mtimeOfDaysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  it('should not delete anything when keepRaw is true', async () => {
    mockConfig({ keepRaw: true });
    const { cleanExpiredData } = await import('../cleaner');

    const result = cleanExpiredData('livid');

    expect(result).toEqual({
      enabled: false,
      retentionDays: 1,
      deleted: [],
      skipped: [
        { type: 'raw', reason: 'retention_disabled' },
        { type: 'analyzed', reason: 'retention_disabled' },
      ],
    });
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('should delete expired raw and analyzed files', async () => {
    mockConfig({ keepRaw: false, rawRetention: 1 });
    // 两个文件都存在
    mockedFs.existsSync.mockReturnValue(true);
    // 两个文件都过期（2 天前）
    mockedFs.statSync.mockReturnValue({ mtimeMs: mtimeOfDaysAgo(2).getTime() } as fs.Stats);
    mockedFs.unlinkSync.mockImplementation(() => {});
    const { cleanExpiredData } = await import('../cleaner');

    const result = cleanExpiredData('livid');

    expect(result).toEqual({
      enabled: true,
      retentionDays: 1,
      deleted: ['raw', 'analyzed'],
      skipped: [],
    });
    expect(mockedFs.unlinkSync).toHaveBeenCalledTimes(2);
  });

  it('should keep files that are not expired', async () => {
    mockConfig({ keepRaw: false, rawRetention: 3 });
    mockedFs.existsSync.mockReturnValue(true);
    // 文件仅 1 天前修改，保留天数 3 天，不应删除
    mockedFs.statSync.mockReturnValue({ mtimeMs: mtimeOfDaysAgo(1).getTime() } as fs.Stats);
    const { cleanExpiredData } = await import('../cleaner');

    const result = cleanExpiredData('livid');

    expect(result).toEqual({
      enabled: true,
      retentionDays: 3,
      deleted: [],
      skipped: [
        { type: 'raw', reason: 'not_expired' },
        { type: 'analyzed', reason: 'not_expired' },
      ],
    });
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('should report missing source files without deleting anything', async () => {
    mockConfig({ keepRaw: false, rawRetention: 1 });
    mockedFs.existsSync.mockReturnValue(false);
    const { cleanExpiredData } = await import('../cleaner');

    const result = cleanExpiredData('livid');

    expect(result.skipped).toEqual([
      { type: 'raw', reason: 'missing' },
      { type: 'analyzed', reason: 'missing' },
    ]);
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('should preserve diagnostics when metadata or deletion fails', async () => {
    mockConfig({ keepRaw: false, rawRetention: 1 });
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.statSync
      .mockImplementationOnce(() => {
        throw new Error('stat failed');
      })
      .mockReturnValueOnce({ mtimeMs: mtimeOfDaysAgo(2).getTime() } as fs.Stats);
    mockedFs.unlinkSync.mockImplementation(() => {
      throw new Error('delete failed');
    });
    const { cleanExpiredData } = await import('../cleaner');

    const result = cleanExpiredData('livid');

    expect(result.skipped).toEqual([
      { type: 'raw', reason: 'metadata_unavailable' },
      { type: 'analyzed', reason: 'delete_failed' },
    ]);
    expect(result.deleted).toEqual([]);
  });

  it('should never delete result.json', async () => {
    mockConfig({ keepRaw: false, rawRetention: 0 });
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.statSync.mockReturnValue({ mtimeMs: mtimeOfDaysAgo(100).getTime() } as fs.Stats);
    mockedFs.unlinkSync.mockImplementation(() => {});
    const { cleanExpiredData } = await import('../cleaner');

    const result = cleanExpiredData('livid');

    // 只应清理 raw 和 analyzed，不包含 result
    expect(result.deleted).not.toContain('result');
    // unlinkSync 最多被调用 2 次（raw + analyzed）
    expect(mockedFs.unlinkSync).toHaveBeenCalledTimes(2);
  });
});
