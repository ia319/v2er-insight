import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { parseUserProfile } from '../user-profile';

const loadFixture = (filename: string): string => {
  return readFileSync(join(__dirname, 'fixtures', filename), 'utf-8');
};

describe('parseUserProfile', () => {
  it('should parse daily ranking and join date', () => {
    const html = loadFixture('user-profile.html');
    const result = parseUserProfile(html);

    expect(result.dailyRanking).toBe(888);
    expect(result.joinDate).toBe('2020-06-15 10:30:00 +08:00');
  });
});
