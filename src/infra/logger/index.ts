/**
 * 全局日志模块
 *
 * 提供四级日志（error > warn > info > debug），全局单例。
 * 无外部依赖，所有层均可使用。
 *
 * 用法:
 *   import { logger } from '@/infra/logger';
 *   logger.info('消息');
 *
 * 入口处设置级别:
 *   logger.setLevel('debug');
 */

export { logger } from './logger';
export type { LogLevel } from './logger';
