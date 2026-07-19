import path from 'path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/infra/storage', () => ({
  getDataRootDir: () => 'mock-data-root',
}));

describe('resolveCodexProjectPath', () => {
  it('should apply CLI, config, and storage priority', async () => {
    const { resolveCodexProjectPath } = await import('../project-path');
    const baseDir = path.resolve('work');

    expect(resolveCodexProjectPath('cli-project', 'config-project', baseDir)).toEqual({
      path: path.join(baseDir, 'cli-project'),
      source: 'cli',
    });
    expect(resolveCodexProjectPath(undefined, 'config-project', baseDir)).toEqual({
      path: path.join(baseDir, 'config-project'),
      source: 'config',
    });
    expect(resolveCodexProjectPath()).toEqual({
      path: path.resolve('mock-data-root'),
      source: 'storage',
    });
  });

  it('should reject empty explicit paths', async () => {
    const { resolveCodexProjectPath } = await import('../project-path');

    expect(() => resolveCodexProjectPath('   ')).toThrow('Project path is empty');
  });
});

describe('assertCodexProjectDirectory', () => {
  it('should accept an existing directory', async () => {
    const { assertCodexProjectDirectory } = await import('../project-path');

    expect(() => assertCodexProjectDirectory(process.cwd())).not.toThrow();
  });

  it('should distinguish files from missing directories', async () => {
    const { assertCodexProjectDirectory } = await import('../project-path');
    expect(() => assertCodexProjectDirectory(path.join(process.cwd(), 'package.json'))).toThrow(
      'not a directory',
    );
    expect(() =>
      assertCodexProjectDirectory(path.join(process.cwd(), 'missing-codex-project')),
    ).toThrow('does not exist');
  });
});
