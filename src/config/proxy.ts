import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { readConfig } from './storage';
import { logger } from '@/infra/logger';

/**
 * 获取代理 URL
 * 优先级：配置文件 > HTTPS_PROXY > HTTP_PROXY
 */
export function getProxyUrl(): string | undefined {
  const config = readConfig();
  return config.proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
}

/**
 * 为原生 fetch() 初始化代理
 *
 * 通过 undici 的 setGlobalDispatcher 设置全局代理，
 * 使 @google/genai 等使用原生 fetch() 的库走配置的代理。
 * 不影响 Axios 请求（Fetcher 模块仍使用自己的 httpsAgent）。
 *
 * 应在 CLI 入口处调用一次。
 */
export function initFetchProxy(): void {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return;

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  logger.debug(`已为原生 fetch 设置代理: ${proxyUrl}`);
}
