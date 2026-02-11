import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('infra/logger', () => {
  let logger: typeof import('../logger').logger;

  beforeEach(async () => {
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const mod = await import('../logger');
    logger = mod.logger;
    logger.setLevel('debug'); // 每次测试重置为最低级别
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('级别过滤', () => {
    it('debug 级别时所有消息都应输出', () => {
      logger.setLevel('debug');
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      expect(console.log).toHaveBeenCalledTimes(2); // debug + info
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('info 级别时应过滤 debug 消息', () => {
      logger.setLevel('info');
      logger.debug('d');
      logger.info('i');

      expect(console.log).toHaveBeenCalledTimes(1); // 仅 info
    });

    it('warn 级别时应过滤 debug 和 info 消息', () => {
      logger.setLevel('warn');
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('error 级别时应仅输出 error 消息', () => {
      logger.setLevel('error');
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      expect(console.log).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('getLevel / setLevel', () => {
    it('应正确返回当前级别', () => {
      logger.setLevel('warn');
      expect(logger.getLevel()).toBe('warn');
    });

    it('默认级别应为 info', async () => {
      vi.resetModules();
      const freshMod = await import('../logger');
      expect(freshMod.logger.getLevel()).toBe('info');
    });
  });

  describe('输出格式', () => {
    it('info 消息不应带有标签前缀', () => {
      logger.info('测试消息');

      expect(console.log).toHaveBeenCalledWith('测试消息');
    });

    it('debug 消息应包含 [DEBUG] 标签', () => {
      logger.debug('调试内容');

      const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(output).toContain('[DEBUG]');
      expect(output).toContain('调试内容');
    });

    it('warn 消息应包含 [WARN] 标签', () => {
      logger.warn('警告内容');

      const output = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(output).toContain('[WARN]');
      expect(output).toContain('警告内容');
    });

    it('error 消息应包含 [ERROR] 标签', () => {
      logger.error('错误内容');

      const output = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(output).toContain('[ERROR]');
      expect(output).toContain('错误内容');
    });
  });
});
