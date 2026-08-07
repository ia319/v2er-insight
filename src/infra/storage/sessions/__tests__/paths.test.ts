import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const USER_DIR = path.join('root', 'data', 'alice');

vi.mock('../../paths', () => ({
  getUserDataDir: vi.fn(() => USER_DIR),
}));

describe('AI session paths', () => {
  it('keeps the index and provider files under the user sessions directory', async () => {
    const { getAISessionFilePath, getAISessionIndexPath } = await import('../paths');
    const localSessionId = '6d8eea46-7e52-47ca-a740-34a0b01bb810';

    expect(getAISessionIndexPath('alice')).toBe(path.join(USER_DIR, 'sessions', 'index.json'));
    expect(getAISessionFilePath('alice', 'codex', localSessionId)).toBe(
      path.join(USER_DIR, 'sessions', 'codex', `${localSessionId}.json`),
    );
  });

  it.each(['session-1', '../session', ''])('rejects unsafe local session ID %s', async (value) => {
    const { getAISessionFilePath } = await import('../paths');
    expect(() => getAISessionFilePath('alice', 'gemini', value)).toThrow(TypeError);
  });
});
