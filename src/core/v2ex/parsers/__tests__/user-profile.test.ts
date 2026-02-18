import { describe, it, expect } from 'vitest';

import { parseUserProfile } from '../user-profile';
import { loadFixture } from '../utils/test-helpers';

const fixturesDir = __dirname;

describe('parseUserProfile', () => {
  it('should parse daily ranking and join date', () => {
    const html = loadFixture(fixturesDir, 'user-profile.html');
    const result = parseUserProfile(html);

    expect(result.dailyRanking).toBe(888);
    expect(result.joinDate).toBe('2020-06-15 10:30:00 +08:00');
  });
});
