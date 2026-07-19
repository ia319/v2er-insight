/**
 * Prompt builder for one complete analysis turn.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AIAnalysisInput } from '../types';

export interface AnalysisRequest {
  systemPrompt: string;
  promptHash: string;
  payload: string;
}

const SYSTEM_PROMPT_PATH = path.join(__dirname, 'system-prompt.md');

function loadSystemPrompt(): string {
  return fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
}

function normalizeSystemPrompt(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

/**
 * Build one complete analysis request from analyzer output.
 *
 * @param input - Normalized analyzer output to send to the AI provider.
 * @returns The normalized system prompt, its content hash, and the compact JSON payload.
 */
export function buildAnalysisRequest(input: AIAnalysisInput): AnalysisRequest {
  const systemPrompt = normalizeSystemPrompt(loadSystemPrompt());
  return {
    systemPrompt,
    promptHash: createHash('sha256').update(systemPrompt, 'utf8').digest('hex'),
    payload: JSON.stringify(input),
  };
}
