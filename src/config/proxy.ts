import { readConfig } from './storage';

/**
 * 获取代理 URL
 * 优先级：配置文件 > HTTPS_PROXY > HTTP_PROXY
 */
export function getProxyUrl(): string | undefined {
  const config = readConfig();
  return config.proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
}
