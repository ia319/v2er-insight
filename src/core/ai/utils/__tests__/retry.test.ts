/**
 * core/ai re-export 链路冒烟测试
 *
 * 行为逻辑已在 infra/retry 层充分覆盖，
 * 此处仅验证 re-export 链路正确性。
 */

import { describe, it, expect } from 'vitest';
import { withRetry } from '../retry';

describe('withRetry re-export', () => {
  it('should be importable and callable via re-export chain', async () => {
    const fn = async () => 'ok';
    const result = await withRetry(fn, { maxRetries: 0, baseDelay: 100, maxDelay: 1000 });
    expect(result).toBe('ok');
  });
});
