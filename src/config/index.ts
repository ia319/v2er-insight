/**
 * 配置模块公共导出
 */

export type { V2erConfig } from './types';
export { getConfigPath } from './path';
export { readConfig, writeConfig } from './storage';
export { getProxyUrl } from './proxy';
