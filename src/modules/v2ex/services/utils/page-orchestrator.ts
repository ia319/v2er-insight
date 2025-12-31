/**
 * 分页数据编排器
 * 提供通用的多页数据获取逻辑
 */

import { Fetcher, SequentialStrategy } from '@/modules/fetcher';
import type { FetchOptions } from '@/modules/fetcher';
import type { PagedResult, ServiceOptions } from '../types';

/**
 * 分页解析结果的基础接口
 * 任何需要分页的解析结果都必须包含这两个字段
 */
export interface PaginatedParseResult {
  currentPage: number;
  totalPages: number;
}

/**
 * 获取分页数据的通用函数
 *
 * @param urlGenerator - 根据页码生成 URL 的函数
 * @param parser - 解析 HTML 并返回包含分页信息的结果
 * @param extractor - 从解析结果中提取数据列表的函数
 * @param options - 服务配置选项
 * @returns 合并后的分页结果
 */
export async function fetchPagedData<TParseResult extends PaginatedParseResult, TData>(
  urlGenerator: (page: number) => string,
  parser: (html: string) => TParseResult,
  extractor: (result: TParseResult) => TData[],
  options?: ServiceOptions,
): Promise<PagedResult<TData>> {
  const fetcher = new Fetcher(new SequentialStrategy());
  const fetchOptions: FetchOptions = {
    timeout: options?.timeout,
    headers: options?.headers,
  };

  const allData: TData[] = [];
  let totalPages = 1;
  let fetchedPages = 0;
  let failedPages = 0;

  // 抓取第一页，获取分页信息
  // total 参数使用 -1 表示尚未确定总页数
  const firstPageUrl = urlGenerator(1);
  options?.events?.onStart?.(firstPageUrl, 0, -1);

  const firstPageGen = fetcher.fetch([firstPageUrl], fetchOptions);
  const firstPageResult = await firstPageGen.next();

  if (!firstPageResult.value?.success || !firstPageResult.value.content) {
    options?.events?.onError?.(firstPageResult.value!, 0, -1);
    return { data: [], totalPages: 1, fetchedPages: 0, failedPages: 1 };
  }

  options?.events?.onSuccess?.(firstPageResult.value, 0, -1);

  // 解析第一页数据
  try {
    const firstParsed = parser(firstPageResult.value.content);
    totalPages = firstParsed.totalPages;
    allData.push(...extractor(firstParsed));
    fetchedPages = 1;
  } catch (error) {
    // 第一页解析失败，通知错误并返回空结果
    options?.events?.onError?.(
      {
        url: firstPageUrl,
        success: false,
        content: null,
        error: error instanceof Error ? error : new Error(String(error)),
        statusCode: 0,
      },
      0,
      -1,
    );
    return { data: [], totalPages: 1, fetchedPages: 0, failedPages: 1 };
  }

  // 单页时直接返回
  if (totalPages <= 1) {
    return { data: allData, totalPages, fetchedPages, failedPages };
  }

  // 生成剩余页 URL 并批量抓取
  const remainingUrls: string[] = [];
  for (let page = 2; page <= totalPages; page++) {
    remainingUrls.push(urlGenerator(page));
  }

  let pageIndex = 1; // 从第2页开始，index=1
  for await (const result of fetcher.fetch(remainingUrls, fetchOptions, options?.events)) {
    if (result.success && result.content) {
      try {
        const parsed = parser(result.content);
        allData.push(...extractor(parsed));
        fetchedPages++;
      } catch (error) {
        // 单页解析失败，通知错误并继续
        options?.events?.onError?.(
          {
            url: result.url,
            success: false,
            content: null,
            error: error instanceof Error ? error : new Error(String(error)),
            statusCode: 0,
          },
          pageIndex,
          totalPages,
        );
        failedPages++;
      }
    } else {
      failedPages++;
    }
    pageIndex++;
  }

  return { data: allData, totalPages, fetchedPages, failedPages };
}
