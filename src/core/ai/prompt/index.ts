/**
 * Prompt Builder - Multi-turn Message Sequence
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AIAnalysisInput } from '../types';

export interface AnalysisRequest {
  systemPrompt: string;
  payload: string;
}

export interface MessageSequence {
  systemPrompt: string;
  messages: string[];
  finalPrompt: string;
}

// Load system prompt from md file
const SYSTEM_PROMPT_PATH = path.join(__dirname, 'system-prompt.md');

function loadSystemPrompt(): string {
  return fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
}

/**
 * Build one complete analysis request from analyzer output.
 *
 * @param input - Normalized analyzer output to send to the AI provider.
 * @returns The system prompt and compact JSON payload for one analysis turn.
 */
export function buildAnalysisRequest(input: AIAnalysisInput): AnalysisRequest {
  return {
    systemPrompt: loadSystemPrompt(),
    payload: JSON.stringify(input),
  };
}

/**
 * Build message sequence for multi-turn chat
 *
 * Sequence:
 * 1. UserOverview
 * 2. PeriodsSummary
 * 3. Each PeriodContent/Chunk
 * 4. Final prompt requesting analysis
 */
export function buildMessageSequence(input: AIAnalysisInput): MessageSequence {
  const messages: string[] = [];

  // 1. UserOverview
  messages.push(JSON.stringify({ userOverview: input.userOverview }, null, 2));

  // 2. PeriodsSummary
  messages.push(JSON.stringify({ summary: input.summary }, null, 2));

  // 3. Each content chunk
  if (input.contents.length === 0) {
    console.warn('Warning: contents is empty');
  }
  for (const content of input.contents) {
    messages.push(JSON.stringify(content, null, 2));
  }

  return {
    systemPrompt: loadSystemPrompt(),
    messages,
    finalPrompt: '根据以上数据生成用户分析报告，严格按照 Output Schema 输出 JSON。',
  };
}
