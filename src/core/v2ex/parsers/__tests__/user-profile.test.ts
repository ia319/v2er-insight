import { describe, it, expect } from 'vitest';

import { parseUserProfile } from '../user-profile';
import { loadFixture } from '../utils/test-helpers';

const fixturesDir = __dirname;

describe('parseUserProfile', () => {
  it('parses registration from the full profile without matching its language', () => {
    const html = loadFixture(fixturesDir, 'user-profile-current.html');

    expect(parseUserProfile(html)).toEqual({
      dailyRanking: 321,
      joinDate: '2021-02-03 04:05:06 +08:00',
    });
  });

  it('ignores registration-like text outside the profile heading', () => {
    const html = loadFixture(fixturesDir, 'user-profile-current.html').replace(
      '<div id="Main">',
      '<div id="Main"><span class="gray">加入于 1999-01-01 00:00:00 +08:00</span>',
    );

    expect(parseUserProfile(html).joinDate).toBe('2021-02-03 04:05:06 +08:00');
  });

  it('does not choose between multiple registration candidates', () => {
    const html = loadFixture(fixturesDir, 'user-profile-current.html').replace(
      '<span class="gray">V2EX member',
      '<span class="gray">加入于 1999-01-01 00:00:00 +08:00</span><span class="gray">V2EX member',
    );

    expect(parseUserProfile(html).joinDate).toBe('');
  });

  it('should parse daily ranking and join date', () => {
    const html = loadFixture(fixturesDir, 'user-profile.html');
    const result = parseUserProfile(html);

    expect(result.dailyRanking).toBe(888);
    expect(result.joinDate).toBe('2020-06-15 10:30:00 +08:00');
  });
});
