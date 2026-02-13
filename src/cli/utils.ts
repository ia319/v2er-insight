/**
 * CLI 共享工具函数
 */

import type { FetchResult, FetchEvents } from '@/infra/fetcher';
import { logger } from '@/infra/logger';

/** 响应体预览最大长度 */
const ERROR_BODY_PREVIEW_LENGTH = 200;

/**
 * 打印抓取错误详情
 *
 * 优化输出格式：第一行使用 logger.error 显示错误标题，
 * 后续细节使用 logger.detail 保持缩进对齐。
 */
export function logFetchError(result: FetchResult): void {
  logger.error(`抓取失败: ${result.url}`);

  if (result.statusCode !== undefined) {
    logger.detail(`状态码: ${result.statusCode}`);
  }

  if (result.error) {
    logger.detail(`错误信息: ${result.error.message}`);
  }

  if (result.errorBody) {
    const preview = result.errorBody.substring(0, ERROR_BODY_PREVIEW_LENGTH).replace(/\s+/g, ' ');
    const suffix = result.errorBody.length > ERROR_BODY_PREVIEW_LENGTH ? '...' : '';
    logger.detail(`响应预览: ${preview}${suffix}`);
  }
}

/**
 * 创建通用的抓取事件回调
 *
 * 用于命令行抓取过程中的进度展示和错误记录。
 *
 * @param label - 进度条前的标签（如 "获取资料"、"抓取帖子"）
 */
export function createFetchEvents(label: string): FetchEvents {
  return {
    onStart: (_url: string, index: number, total: number) => {
      logger.progress(index, total, label);
    },
    onError: (result: FetchResult) => {
      logFetchError(result);
    },
  };
}
