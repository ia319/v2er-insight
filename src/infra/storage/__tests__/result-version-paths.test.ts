import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_DIR = path.join('root', 'data', 'alice');

vi.mock('../paths', () => ({
  getUserDataDir: vi.fn(() => USER_DIR),
}));

describe('result version paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps index, version files, and the write lock under the user results directory', async () => {
    const { getResultVersionFilePath, getResultVersionIndexPath, getResultVersionLockPath } =
      await import('../result-version-paths');

    expect(getResultVersionIndexPath('alice')).toBe(path.join(USER_DIR, 'results', 'index.json'));
    expect(getResultVersionFilePath('alice', 'v000001')).toBe(
      path.join(USER_DIR, 'results', 'versions', 'v000001.json'),
    );
    expect(getResultVersionLockPath('alice')).toBe(path.join(USER_DIR, 'results', '.write.lock'));
  });

  it.each(['../v000001', 'v1', 'V000001'])('rejects unsafe version ID %s', async (versionId) => {
    const { getResultVersionFilePath } = await import('../result-version-paths');

    expect(() => getResultVersionFilePath('alice', versionId)).toThrow(TypeError);
  });
});
