/**
 * config 命令
 *
 * 提供配置的查看、设置和代理管理功能。
 * 所有配置持久化到 ~/.v2er-insight/config.json。
 */

import type { V2erConfig } from '@/config';
import { DEFAULT_CONFIG, readConfig, writeConfig, getConfig, getConfigPath } from '@/config';
import { logger } from '@/infra/logger';
import { createDataRetentionEnabledNotice } from '../workflow/data-retention-notices';
import { renderNotice } from '../workflow/notices';

// -- 配置路径元数据 -----------------------------------------------------------

/** 配置路径的值类型 */
type ConfigValueType = 'string' | 'number' | 'boolean' | 'enum';

interface ConfigPathMeta {
  type: ConfigValueType;
  /** 枚举可选值（仅 type='enum' 时有效） */
  values?: readonly string[];
}

/**
 * 合法配置路径白名单
 *
 * 作用：
 * 1. 校验用户输入的 dotpath 是否合法
 * 2. 自动推断值类型并做类型转换
 * 3. 枚举路径做候选值校验
 */
// NOTE: 枚举 values 与类型定义（ThinkingLevel、LogLevel 等）存在耦合，新增枚举值时需同步更新。
// 未来可考虑从类型定义中统一导出枚举值以减少维护负担。
const CONFIG_PATHS: Record<string, ConfigPathMeta> = {
  // 顶层
  proxy: { type: 'string' },
  // AI
  'ai.provider': { type: 'enum', values: ['gemini'] },
  'ai.apiKey': { type: 'string' },
  'ai.model': { type: 'string' },
  'ai.thinkingLevel': { type: 'enum', values: ['minimal', 'low', 'medium', 'high'] },
  'ai.timeout': { type: 'number' },
  'ai.maxRetries': { type: 'number' },
  'ai.baseDelay': { type: 'number' },
  'ai.maxDelay': { type: 'number' },
  // Fetch
  'fetch.timeout': { type: 'number' },
  'fetch.maxRetries': { type: 'number' },
  'fetch.baseDelay': { type: 'number' },
  'fetch.maxDelay': { type: 'number' },
  // Analyzer
  'analyzer.inactivityThreshold': { type: 'number' },
  'analyzer.chunkMaxTopics': { type: 'number' },
  'analyzer.chunkMaxReplies': { type: 'number' },
  'analyzer.nodeDistributionTopN': { type: 'number' },
  // Data
  'data.keepRaw': { type: 'boolean' },
  'data.rawRetention': { type: 'number' },
  // Log
  'log.level': { type: 'enum', values: ['error', 'warn', 'info', 'debug'] },
} satisfies Record<string, ConfigPathMeta>;

/** 所有合法的顶层分组名 */
const CONFIG_GROUPS = ['ai', 'fetch', 'analyzer', 'data', 'log'] as const;
type ConfigGroup = (typeof CONFIG_GROUPS)[number];

type DataRetentionStatus =
  | { enabled: false }
  | {
      enabled: true;
      retentionDays: number;
    };

// -- 工具函数 -----------------------------------------------------------------

/**
 * 掩码敏感字段（如 apiKey）
 *
 * 保留前 4 位和后 4 位，中间用 **** 替代。
 * 长度不足 8 位时全部掩码。
 */
function maskSensitive(value: string): string {
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

/**
 * 格式化配置值用于显示
 *
 * 对 apiKey 字段做掩码处理，其余原样输出。
 */
// NOTE: 目前仅 ai.apiKey 需要掩码。若新增其他敏感字段，考虑用元数据驱动替代硬编码。
function formatConfigForDisplay(config: V2erConfig): V2erConfig {
  const display = JSON.parse(JSON.stringify(config)) as V2erConfig;
  if (display.ai?.apiKey) {
    display.ai.apiKey = maskSensitive(display.ai.apiKey);
  }
  return display;
}

function resolveDataRetentionStatus(config: V2erConfig): DataRetentionStatus {
  const keepRaw = config.data?.keepRaw ?? DEFAULT_CONFIG.data.keepRaw;
  if (keepRaw) {
    return { enabled: false };
  }

  return {
    enabled: true,
    retentionDays: Math.max(0, config.data?.rawRetention ?? DEFAULT_CONFIG.data.rawRetention),
  };
}

function renderRetentionStatus(config: V2erConfig): void {
  const retention = resolveDataRetentionStatus(config);
  if (!retention.enabled) {
    logger.info('自动清理: 未启用');
    logger.diagnostic('info', '文档: docs/data-lifecycle.md');
    return;
  }

  renderNotice(createDataRetentionEnabledNotice(retention.retentionDays));
}

/**
 * 将字符串值按目标类型转换
 */
function coerceValue(raw: string, meta: ConfigPathMeta): string | number | boolean {
  switch (meta.type) {
    case 'boolean':
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw new Error(`Invalid boolean value: "${raw}" (expected: true | false)`);

    case 'number': {
      const num = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(num) || num < 0) {
        throw new Error(`Invalid number value: "${raw}" (expected non-negative finite number)`);
      }
      return num;
    }

    case 'enum':
      if (!meta.values?.includes(raw)) {
        throw new Error(`Invalid value: "${raw}" (expected: ${meta.values?.join(' | ')})`);
      }
      return raw;

    case 'string':
    default:
      return raw;
  }
}

/**
 * 按点分路径设置深层值
 *
 * 例如 setByPath(obj, 'ai.model', 'gemini-2.5-flash')
 * → obj.ai.model = 'gemini-2.5-flash'
 */
function setByPath(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = dotPath.split('.');

  // 顶层字段直接设置
  if (parts.length === 1) {
    obj[parts[0]!] = value;
    return;
  }

  // 嵌套字段：确保中间对象存在
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]!] = value;
}

// -- 命令实现 -----------------------------------------------------------------

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

/**
 * 查看配置
 *
 * 无参数显示完整配置，传 group 显示指定分组。
 */
export function configShow(group?: string): void {
  const config = getConfig();
  const display = formatConfigForDisplay(config);

  // 指定分组
  if (group) {
    // proxy 作为特殊的顶层字段
    if (group === 'proxy') {
      if (display.proxy) {
        logger.info(`[proxy] ${display.proxy}`);
      } else {
        logger.info('[proxy] (not set)');
      }
      return;
    }

    if (!CONFIG_GROUPS.includes(group as ConfigGroup)) {
      logger.error(`Unknown config group: "${group}"`);
      logger.detail(`Available groups: proxy, ${CONFIG_GROUPS.join(', ')}`);
      return;
    }

    const groupConfig = display[group as ConfigGroup];
    logger.info(`[${group}]`);
    console.log(JSON.stringify(groupConfig, null, 2));
    if (group === 'data') {
      renderRetentionStatus(config);
    }
    return;
  }

  // 全量显示
  console.log(JSON.stringify(display, null, 2));
  logger.detail(`\nConfig file: ${getConfigPath()}`);
}

/**
 * 设置配置项
 *
 * 支持点分路径，自动类型转换和枚举校验。
 *
 * 示例：
 *   configSet('ai.model', 'gemini-2.5-flash')
 *   configSet('data.keepRaw', 'true')
 *   configSet('log.level', 'debug')
 */
export function configSet(dotPath: string, rawValue: string): void {
  // 路径白名单校验
  const meta = CONFIG_PATHS[dotPath];
  if (!meta) {
    logger.error(`Unknown config path: "${dotPath}"`);
    logger.detail('Available paths:');
    for (const path of Object.keys(CONFIG_PATHS)) {
      logger.detail(`  ${path}`);
    }
    return;
  }

  // 类型转换 + 枚举校验
  let value: string | number | boolean;
  try {
    value = coerceValue(rawValue, meta);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    return;
  }

  // 读取 → 设置 → 写入
  const config = readConfig();
  setByPath(config as Record<string, unknown>, dotPath, value);
  writeConfig(config);

  // 敏感值掩码显示
  const displayValue = dotPath.endsWith('apiKey') ? maskSensitive(String(value)) : String(value);
  logger.info(`Set ${dotPath} = ${displayValue}`);

  if (dotPath === 'data.keepRaw' || dotPath === 'data.rawRetention') {
    const retention = resolveDataRetentionStatus(config);
    if (retention.enabled) {
      renderNotice(createDataRetentionEnabledNotice(retention.retentionDays));
    }
  }
}

/**
 * 重置配置
 *
 * 无参数清空整个配置文件（恢复全部默认值）。
 * 传 group 只清除指定分组。
 *
 * 示例：
 *   configReset()         → 清空所有用户配置
 *   configReset('ai')     → 仅清除 ai 分组
 */
export function configReset(group?: string): void {
  // 指定分组
  if (group) {
    // 支持 proxy 作为特殊的顶层字段
    if (group === 'proxy') {
      const config = readConfig();
      delete config.proxy;
      writeConfig(config);
      logger.info('Reset: proxy');
      return;
    }

    if (!CONFIG_GROUPS.includes(group as ConfigGroup)) {
      logger.error(`Unknown config group: "${group}"`);
      logger.detail(`Available groups: proxy, ${CONFIG_GROUPS.join(', ')}`);
      return;
    }

    const config = readConfig();
    delete config[group as ConfigGroup];
    writeConfig(config);
    logger.info(`Reset: ${group}`);
    return;
  }

  // 全部清空
  writeConfig({});
  logger.info('All configuration reset to defaults');
}
