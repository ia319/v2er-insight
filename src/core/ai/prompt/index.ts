/**
 * Prompt builder for one complete analysis turn.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AIAnalysisInput } from '../types';

export interface AnalysisRequest {
  systemPrompt: string;
  payload: string;
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
