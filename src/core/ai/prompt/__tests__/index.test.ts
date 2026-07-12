/**
 * Unit tests for prompt/index.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

describe('system prompt protocol', () => {
  it('should require immediate analysis of one complete input', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const promptPath = path.resolve(process.cwd(), 'src/core/ai/prompt/system-prompt.md');
    const prompt = actualFs.readFileSync(promptPath, 'utf8');

    expect(prompt).toContain('one complete analysis input');
    expect(prompt).toContain('Do not wait for a follow-up instruction');
    expect(prompt).toContain('Return exactly one valid JSON object');
  });
});
