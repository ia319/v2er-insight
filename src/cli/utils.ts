/**
 * CLI 共享工具函数
 */

import type { FetchResult } from '@/infra/fetcher';
import { logger } from '@/infra/logger';

/** 响应体预览最大长度 */
const ERROR_BODY_PREVIEW_LENGTH = 200;

/**
 * 打印抓取错误详情
 */
export function logFetchError(result: FetchResult): void {
  const lines: string[] = [`  [FETCH ERROR] ${result.url}`];

  if (result.statusCode !== undefined) {
    lines.push(`    Status: ${result.statusCode}`);
  }

  if (result.error) {
    lines.push(`    Error: ${result.error.message}`);
  }

  if (result.errorBody) {
    const preview = result.errorBody.substring(0, ERROR_BODY_PREVIEW_LENGTH).replace(/\s+/g, ' ');
    const suffix = result.errorBody.length > ERROR_BODY_PREVIEW_LENGTH ? '...' : '';
    lines.push(`    Response: ${preview}${suffix}`);
  }

  logger.error(lines.join('\n'));
}
