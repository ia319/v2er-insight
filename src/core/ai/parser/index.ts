/**
 * AI 响应解析器
 */

import { validateResponse, type ValidationResult } from './validator';

export type { ValidationResult };

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
 *
 * 返回 ValidationResult，包含 data 和 warnings
 */
export function parseResponse(rawText: string): ValidationResult {
  const jsonStr = extractJson(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    // JSON 解析失败，返回默认值和警告
    return {
      data: validateResponse(null).data,
      warnings: [`JSON 解析失败: ${e instanceof Error ? e.message : '未知错误'}`],
    };
  }

  return validateResponse(parsed);
}
