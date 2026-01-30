/**
 * HTTP Agent 配置
 */

import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Agent } from 'https';
import { getProxyUrl } from '@/config';

/**
 * 获取 HTTPS Agent
 * 优先从配置文件读取，其次从环境变量读取
 */
export function getHttpsAgent(): Agent | undefined {
  const proxyUrl = getProxyUrl();
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
}
