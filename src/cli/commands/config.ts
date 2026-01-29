/**
 * config 命令
 */

import { readConfig, writeConfig, getConfigPath } from '@/config';
import { logger } from '../output';

interface ConfigProxyOptions {
  clear?: boolean;
}

/**
 * 代理配置命令
 */
export function configProxy(url?: string, options?: ConfigProxyOptions): void {
  const config = readConfig();

  // 清除代理
  if (options?.clear) {
    delete config.proxy;
    writeConfig(config);
    logger.info('Proxy cleared');
    return;
  }

  // 设置代理
  if (url) {
    config.proxy = url;
    writeConfig(config);
    logger.info(`Proxy set to: ${url}`);
    logger.detail(`Config file: ${getConfigPath()}`);
    return;
  }

  // 查看代理
  if (config.proxy) {
    logger.info(`Current proxy: ${config.proxy}`);
  } else {
    logger.info('No proxy configured');
    logger.detail('Use: v2er config proxy <url>');
  }
}
