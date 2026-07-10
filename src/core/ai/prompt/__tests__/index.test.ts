/**
 * Unit tests for prompt/index.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import type { AnalyzerOutput, PeriodContentChunk } from '@/core/analyzer/types';

vi.mock('node:fs');

/** Create a base input fixture with optional overrides */
function createInput(
  overrides: {
    totalPeriods?: number;
    contents?: AnalyzerOutput['contents'];
  } = {},
): AnalyzerOutput {
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

describe('buildAnalysisRequest', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(fs.readFileSync).mockReturnValue('# System Prompt\nTest prompt content');
  });

  it('should build one compact JSON payload with the system prompt', async () => {
    const { buildAnalysisRequest } = await import('../index');
    const input = createInput();

    const result = buildAnalysisRequest(input);

    expect(result.systemPrompt).toContain('Test prompt content');
    expect(result.payload).toBe(JSON.stringify(input));
    expect(JSON.parse(result.payload)).toEqual(input);
  });

  it('should preserve all period chunks in the payload', async () => {
    const { buildAnalysisRequest } = await import('../index');
    const chunks: PeriodContentChunk[] = [
      {
        periodIndex: 0,
        chunkIndex: 0,
        totalChunksInPeriod: 2,
        topics: [{ title: 'Topic', nodeName: 'tech', content: 'First chunk' }],
        replies: [],
      },
      {
        periodIndex: 0,
        chunkIndex: 1,
        totalChunksInPeriod: 2,
        topics: [],
        replies: [{ topicTitle: 'Topic', nodeName: 'tech', content: 'Second chunk' }],
      },
    ];
    const input = createInput({ contents: chunks });

    const result = buildAnalysisRequest(input);

    expect(JSON.parse(result.payload)).toEqual(input);
  });

  it('should preserve an empty contents array without adding an envelope', async () => {
    const { buildAnalysisRequest } = await import('../index');
    const input = createInput({ contents: [] });

    const result = buildAnalysisRequest(input);
    const payload = JSON.parse(result.payload) as Record<string, unknown>;

    expect(payload).toEqual(input);
    expect(Object.keys(payload)).toEqual(['userOverview', 'summary', 'contents']);
  });
});

describe('buildMessageSequence', () => {
  beforeEach(() => {
    vi.resetModules();
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
