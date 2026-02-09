/**
 * AI 响应解析器
 */

import type { AIAnalysisResult } from '../types';
import { validateResponse } from './validator';

/**
 * 如果存在 markdown 代码块，从中提取 JSON
 */
function extractJson(text: string): string {
  // Try to extract from ```json ... ``` or ``` ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }
  return text.trim();
}

/**
 * 将 AI 响应文本解析为 AIAnalysisResult
 */
export function parseResponse(rawText: string): AIAnalysisResult {
  const jsonStr = extractJson(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`JSON 解析失败: ${e instanceof Error ? e.message : '未知错误'}`);
  }

  return validateResponse(parsed);
}
