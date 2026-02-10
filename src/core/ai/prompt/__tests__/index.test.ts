/**
 * Unit tests for prompt/index.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';

vi.mock('node:fs');

/** Create a base input fixture with optional overrides */
function createInput(
  overrides: {
    totalPeriods?: number;
    contents?: Array<{ periodIndex: number; topics: never[]; replies: never[] }>;
  } = {},
) {
  return {
    userOverview: {
      joinDate: '2020-01-01',
      lastActiveTime: '2024-01-01',
      topicReplyRatio: 0.5,
      totalTopics: 10,
      totalReplies: 20,
      isTopicsHidden: false,
      dailyRanking: 100,
    },
    summary: {
      totalPeriods: overrides.totalPeriods ?? 1,
      periods: [],
    },
    contents: overrides.contents ?? [],
  };
}

describe('buildMessageSequence', () => {
  beforeEach(() => {
    vi.mocked(fs.readFileSync).mockReturnValue('# System Prompt\nTest prompt content');
  });

  it('should build correct message sequence structure', async () => {
    const { buildMessageSequence } = await import('../index');

    const result = buildMessageSequence(createInput());

    expect(result.systemPrompt).toContain('Test prompt content');
    expect(result.messages).toHaveLength(2); // userOverview + summary
    expect(result.finalPrompt).toContain('JSON');
  });

  it('should generate messages for each active period contents', async () => {
    const { buildMessageSequence } = await import('../index');

    const result = buildMessageSequence(
      createInput({
        totalPeriods: 2,
        contents: [
          { periodIndex: 0, topics: [], replies: [] },
          { periodIndex: 1, topics: [], replies: [] },
        ],
      }),
    );

    // userOverview + summary + 2 contents
    expect(result.messages).toHaveLength(4);
  });

  it('messages should be valid JSON strings', async () => {
    const { buildMessageSequence } = await import('../index');

    const result = buildMessageSequence(createInput());

    result.messages.forEach((msg) => {
      expect(() => JSON.parse(msg)).not.toThrow();
    });
  });
});
