import { describe, expect, it } from 'vitest';
import { getRecoveryActions } from '../recovery';

describe('getRecoveryActions', () => {
  it('should render username placeholder in command content', () => {
    const actions = getRecoveryActions('FETCH_PROFILE_FAILED', { username: 'alice' });

    expect(actions[0]?.content).toContain('alice');
    expect(actions[0]?.content).not.toContain('<username>');
  });

  it('should keep AI provider guidance with common cause instruction', () => {
    const actions = getRecoveryActions('AI_PROVIDER_FAILED', { username: 'alice' });

    expect(actions.some((action) => action.type === 'instruction')).toBe(true);
    expect(actions.some((action) => action.content.includes('429'))).toBe(true);
  });
});
