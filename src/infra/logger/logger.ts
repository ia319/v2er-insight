/**
 * 全局日志模块 — 基于级别过滤
 *
 * 级别优先级：error > warn > info > debug
 * 设置为 'info' 时，'debug' 消息会被过滤。
 *
 * 使用 ANSI 转义码实现终端彩色输出，无外部依赖。
 */

// -- 类型 --------------------------------------------------------------------

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** 未知总数的哨兵值 */
export const UNKNOWN_TOTAL = -1;

// -- 常量 --------------------------------------------------------------------

/** 级别优先级（数值越大越严重） */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** ANSI 颜色码 */
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
} as const;

/** 级别显示标签 */
const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: `${COLORS.gray}[DEBUG]${COLORS.reset}`,
  info: '',
  warn: `${COLORS.yellow}[WARN]${COLORS.reset}`,
  error: `${COLORS.red}[ERROR]${COLORS.reset}`,
};

// -- 状态 --------------------------------------------------------------------

let currentLevel: LogLevel = 'info';

// -- 内部函数 ----------------------------------------------------------------

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatMessage(level: LogLevel, msg: string): string {
  const label = LEVEL_LABELS[level];
  return label ? `${label} ${msg}` : msg;
}

// -- 公共 API ----------------------------------------------------------------

export const logger = {
  /** 设置最低日志级别，低于此级别的消息将被过滤 */
  setLevel(level: LogLevel): void {
    currentLevel = level;
  },

  /** 获取当前日志级别 */
  getLevel(): LogLevel {
    return currentLevel;
  },

  /** 调试信息 — 仅 verbose 模式可见 */
  debug(msg: string): void {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', msg));
    }
  },

  /** 普通信息 — 正常输出 */
  info(msg: string): void {
    if (shouldLog('info')) {
      console.log(formatMessage('info', msg));
    }
  },

  /** 警告信息 — 非致命异常 */
  warn(msg: string): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', msg));
    }
  },

  /** 错误信息 — 操作失败 */
  error(msg: string): void {
    if (shouldLog('error')) {
      console.error(formatMessage('error', msg));
    }
  },

  // -- CLI 格式化输出 --------------------------------------------------------

  /** 章节标题 — 分隔不同操作阶段 */
  section(title: string): void {
    if (shouldLog('info')) {
      console.log(`\n${title}`);
    }
  },

  /** 成功信息 — 带绿色对勾前缀 */
  success(msg: string): void {
    if (shouldLog('info')) {
      console.log(`  ${COLORS.green}Done:${COLORS.reset} ${msg}`);
    }
  },

  /** 缩进详情 — 补充上一行输出 */
  detail(msg: string): void {
    if (shouldLog('info')) {
      console.log(`  ${msg}`);
    }
  },

  /** 进度显示 — 页码或步骤进度 */
  progress(current: number, total: number, label: string): void {
    if (shouldLog('info')) {
      const display = total === UNKNOWN_TOTAL ? `${current + 1}` : `${current + 1}/${total}`;
      console.log(`  ${label} (${display})...`);
    }
  },
};
