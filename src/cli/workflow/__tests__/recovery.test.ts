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

  it('should describe partial fetch recovery without assuming page failures', () => {
    const actions = getRecoveryActions('FETCH_PARTIAL_FAILED', { username: 'alice' });

    expect(actions[0]?.content).toContain('不完整抓取');
    expect(actions[0]?.content).not.toContain('失败页');
    expect(actions[1]?.content).toContain('alice');
  });
});
