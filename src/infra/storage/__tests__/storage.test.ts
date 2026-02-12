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
      mockedFs.existsSync.mockReturnValue(false);
      const { readDataFile } = await import('../reader');

      expect(readDataFile('livid', 'raw')).toBeNull();
    });

    it('should return parsed object when file exists', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('{"topics":[],"replies":[]}');
      const { readDataFile } = await import('../reader');

      const result = readDataFile<{ topics: unknown[]; replies: unknown[] }>('livid', 'raw');
      expect(result).toEqual({ topics: [], replies: [] });
    });

    it('should return null on JSON parse error', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('invalid json');
      const { readDataFile } = await import('../reader');

      expect(readDataFile('livid', 'raw')).toBeNull();
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
    it('should create directory and write formatted JSON by default', async () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockImplementation(() => '' as never);
      mockedFs.writeFileSync.mockImplementation(() => {});
      const { writeDataFile } = await import('../writer');

      const data = { topics: [1, 2, 3] };
      writeDataFile('livid', 'raw', data);

      // 应创建目录
      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(path.join(mockDataBase, 'livid'), {
        recursive: true,
      });
      // 应写入格式化 JSON
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockDataBase, 'livid', 'raw.json'),
        JSON.stringify(data, null, 2),
        { encoding: 'utf-8' },
      );
    });

    it('should skip directory creation when it already exists', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.writeFileSync.mockImplementation(() => {});
      const { writeDataFile } = await import('../writer');

      writeDataFile('livid', 'result', { summary: 'test' });

      expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should write compact JSON when pretty is false', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.writeFileSync.mockImplementation(() => {});
      const { writeDataFile } = await import('../writer');

      const data = { a: 1 };
      writeDataFile('livid', 'raw', data, { pretty: false });

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockDataBase, 'livid', 'raw.json'),
        JSON.stringify(data),
        { encoding: 'utf-8' },
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
    vi.doMock('@/config', () => ({
      getConfig: () => ({ data }),
    }));
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

    expect(result).toEqual([]);
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

    expect(result).toEqual(['raw', 'analyzed']);
    expect(mockedFs.unlinkSync).toHaveBeenCalledTimes(2);
  });

  it('should keep files that are not expired', async () => {
    mockConfig({ keepRaw: false, rawRetention: 3 });
    mockedFs.existsSync.mockReturnValue(true);
    // 文件仅 1 天前修改，保留天数 3 天，不应删除
    mockedFs.statSync.mockReturnValue({ mtimeMs: mtimeOfDaysAgo(1).getTime() } as fs.Stats);
    const { cleanExpiredData } = await import('../cleaner');

    const result = cleanExpiredData('livid');

    expect(result).toEqual([]);
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('should never delete result.json', async () => {
    mockConfig({ keepRaw: false, rawRetention: 0 });
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.statSync.mockReturnValue({ mtimeMs: mtimeOfDaysAgo(100).getTime() } as fs.Stats);
    mockedFs.unlinkSync.mockImplementation(() => {});
    const { cleanExpiredData } = await import('../cleaner');

    const result = cleanExpiredData('livid');

    // 只应清理 raw 和 analyzed，不包含 result
    expect(result).not.toContain('result');
    // unlinkSync 最多被调用 2 次（raw + analyzed）
    expect(mockedFs.unlinkSync).toHaveBeenCalledTimes(2);
  });
});
