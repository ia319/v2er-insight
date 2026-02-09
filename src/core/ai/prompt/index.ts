/**
 * Prompt Builder - Multi-turn Message Sequence
 */

import type { AIAnalysisInput } from '../types';
import { SYSTEM_PROMPT } from './system-prompt';

export interface MessageSequence {
  systemPrompt: string;
  messages: string[];
  finalPrompt: string;
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
    systemPrompt: SYSTEM_PROMPT,
    messages,
    finalPrompt: '根据以上数据生成用户分析报告，严格按照 Output Schema 输出 JSON。',
  };
}
