import { describe, expect, it } from 'vitest';
import { getRecoveryActions } from '../recovery';

describe('getRecoveryActions', () => {
  it('should return empty list when reasonCode is undefined', () => {
    const actions = getRecoveryActions(undefined, { username: 'alice' });

    expect(actions).toEqual([]);
  });

  it('should return empty list for UNKNOWN_ERROR', () => {
    const actions = getRecoveryActions('UNKNOWN_ERROR', { username: 'alice' });

    expect(actions).toEqual([]);
  });

  it('should render username placeholder in command content', () => {
    const actions = getRecoveryActions('FETCH_PROFILE_FAILED', { username: 'alice' });

    expect(actions[0]?.content).toContain('alice');
    expect(actions[0]?.content).not.toContain('<username>');
    expect(actions[0]?.description).toContain('alice');
    expect(actions[0]?.description).not.toContain('<username>');
  });

  it('should keep AI provider guidance with common cause instruction', () => {
    const actions = getRecoveryActions('AI_PROVIDER_FAILED', { username: 'alice' });

    expect(actions.some((action) => action.type === 'instruction')).toBe(true);
    expect(actions.some((action) => action.content.includes('429'))).toBe(true);
  });

  it('should guide invalid provider and provider-specific options', () => {
    const actions = getRecoveryActions('AI_INVALID_PROVIDER_OPTIONS', { username: 'alice' });

    expect(actions).toEqual([
      {
        type: 'instruction',
        content: '将 --provider 或 ai.provider 设置为 gemini | codex，并使用对应的专属选项',
        description:
          'Gemini 使用 --thinking-level；Codex 使用 --reasoning-effort 和 --codex-project；两个 provider 均支持 --new-thread',
      },
    ]);
  });

  it('should describe partial fetch recovery without assuming page failures', () => {
    const actions = getRecoveryActions('FETCH_PARTIAL_FAILED', { username: 'alice' });

    expect(actions[0]?.content).toContain('不完整抓取');
    expect(actions[0]?.content).not.toContain('失败页');
    expect(actions[1]?.content).toContain('alice');
  });

  it('should preserve invalid provenance evidence before rebuilding', () => {
    const actions = getRecoveryActions('PROVENANCE_STATE_INVALID', { username: 'alice' });

    expect(actions[0]?.content).toContain('备份');
    expect(actions[1]?.content).toContain('alice');
  });
});
