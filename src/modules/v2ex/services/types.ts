/**
 * Service Layer 类型定义
 * 定义服务层的配置选项和返回结果类型
 */

import type { FetchEvents } from '../../fetcher';

/**
 * Service 调用配置选项
 */
export interface ServiceOptions {
  /** 请求超时时间（毫秒），默认使用 Fetcher 的 30000ms */
  timeout?: number;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 抓取事件回调，用于进度展示 */
  events?: FetchEvents;
}

/**
 * 分页数据获取结果
 * 用于返回多页合并后的数据
 */
export interface PagedResult<T> {
  /** 合并后的完整数据列表 */
  data: T[];
  /** 总页数（来自第一页解析） */
  totalPages: number;
  /** 成功抓取的页数 */
  fetchedPages: number;
  /** 失败的页数 */
  failedPages: number;
}
