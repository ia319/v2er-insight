/**
 * Unit tests for prompt/index.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';

vi.mock('node:fs');

describe('buildMessageSequence', () => {
  beforeEach(() => {
    vi.mocked(fs.readFileSync).mockReturnValue('# System Prompt\nTest prompt content');
  });

  it('should build correct message sequence structure', async () => {
    const { buildMessageSequence } = await import('../index');

    const input = {
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
        totalPeriods: 1,
        periods: [],
      },
      contents: [],
    };

    const result = buildMessageSequence(input);

    expect(result.systemPrompt).toContain('Test prompt content');
    expect(result.messages).toHaveLength(2); // userOverview + summary
    expect(result.finalPrompt).toContain('JSON');
  });

  it('should generate messages for each active period contents', async () => {
    const { buildMessageSequence } = await import('../index');

    const input = {
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
        totalPeriods: 2,
        periods: [],
      },
      contents: [
        { periodIndex: 0, topics: [], replies: [] },
        { periodIndex: 1, topics: [], replies: [] },
      ],
    };

    const result = buildMessageSequence(input);

    // userOverview + summary + 2 contents
    expect(result.messages).toHaveLength(4);
  });

  it('messages should be valid JSON strings', async () => {
    const { buildMessageSequence } = await import('../index');

    const input = {
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
        totalPeriods: 1,
        periods: [],
      },
      contents: [],
    };

    const result = buildMessageSequence(input);

    result.messages.forEach((msg) => {
      expect(() => JSON.parse(msg)).not.toThrow();
    });
  });
});
