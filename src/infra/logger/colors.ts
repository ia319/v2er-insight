/**
 * ANSI 终端颜色常量
 *
 * 供 logger 和 CLI 输出模块共享，避免重复定义。
 */

export const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;
