import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('agent', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getHttpsAgent', () => {
    it('should return HttpsProxyAgent when proxy is configured', async () => {
      vi.doMock('@/config', () => ({
        getProxyUrl: () => 'http://proxy:8080',
      }));

      // 使用简单对象作为 mock，不使用 vi.fn()
      vi.doMock('https-proxy-agent', () => ({
        HttpsProxyAgent: class {
          proxyUrl: string;
          constructor(url: string) {
            this.proxyUrl = url;
          }
        },
      }));

      const { getHttpsAgent } = await import('../agent');
      const agent = getHttpsAgent();

      expect(agent).toBeDefined();
      expect(agent).toHaveProperty('proxyUrl', 'http://proxy:8080');
    });

    it('should return undefined when no proxy is configured', async () => {
      vi.doMock('@/config', () => ({
        getProxyUrl: () => undefined,
      }));

      const { getHttpsAgent } = await import('../agent');
      const agent = getHttpsAgent();

      expect(agent).toBeUndefined();
    });
  });
});
