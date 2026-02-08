/**
 * CLI 控制台输出工具
 */

import type { FetchResult } from '@/infra/fetcher';

/** 响应体预览最大长度 */
const ERROR_BODY_PREVIEW_LENGTH = 200;

export const logger = {
  /** 普通信息 */
  info: (msg: string): void => {
    console.log(msg);
  },

  /** 成功信息 */
  success: (msg: string): void => {
    console.log(`  Done: ${msg}`);
  },

  /** 错误信息 */
  error: (msg: string): void => {
    console.log(`  Error: ${msg}`);
  },

  /** 章节标题 */
  section: (title: string): void => {
    console.log(`\n${title}`);
  },

  /** 缩进详情 */
  detail: (msg: string): void => {
    console.log(`  ${msg}`);
  },

  /** 进度显示 */
  progress: (current: number, total: number, label: string): void => {
    const display = total === -1 ? `${current + 1}` : `${current + 1}/${total}`;
    console.log(`  ${label} (${display})...`);
  },

  /** 请求错误详情 */
  fetchError: (result: FetchResult): void => {
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

    console.log(lines.join('\n'));
  },
};
