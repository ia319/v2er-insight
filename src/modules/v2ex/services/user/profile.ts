/**
 * 用户资料获取服务
 */

import { Fetcher, SequentialStrategy } from '@/modules/fetcher';
import type { FetchOptions } from '@/modules/fetcher';
import { getUserProfileUrl } from '../../urls';
import { parseUserProfile } from '../../parsers';
import type { UserProfileParseResult } from '../../types';
import type { ServiceOptions } from '../types';

/**
 * 获取用户资料
 *
 * @param username - 用户名
 * @param options - 服务配置选项
 * @returns 用户资料解析结果，失败时返回 null
 */
export async function getUserProfile(
  username: string,
  options?: ServiceOptions,
): Promise<UserProfileParseResult | null> {
  // 空用户名验证
  if (!username.trim()) {
    throw new Error('Invalid username: empty string provided');
  }

  const fetcher = new Fetcher(new SequentialStrategy());
  const fetchOptions: FetchOptions = {
    timeout: options?.timeout,
    headers: options?.headers,
  };

  const url = getUserProfileUrl(username);
  options?.events?.onStart?.(url, 0, 1);

  const generator = fetcher.fetch([url], fetchOptions);
  const result = await generator.next();

  if (!result.value?.success || !result.value.content) {
    options?.events?.onError?.(result.value!, 0, 1);
    return null;
  }

  options?.events?.onSuccess?.(result.value, 0, 1);

  try {
    return parseUserProfile(result.value.content);
  } catch (error) {
    // 解析失败时也触发错误事件，保持与获取失败的一致性
    options?.events?.onError?.(
      {
        url,
        success: false,
        content: null,
        error: error instanceof Error ? error : new Error(String(error)),
        statusCode: 0,
      },
      0,
      1,
    );
    return null;
  }
}
