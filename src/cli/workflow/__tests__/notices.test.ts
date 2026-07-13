import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserNotice } from '../types';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  detail: vi.fn(),
}));

vi.mock('@/infra/logger', () => ({ logger: mockLogger }));

import { renderNotice, renderNotices } from '../notices';

describe('notice rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders warning code, impact, recovery, and documentation', () => {
    const notice: UserNotice = {
      code: 'DATA_RETENTION_ENABLED',
      severity: 'warning',
      summary: '自动清理已启用',
      details: ['raw.json 和 analyzed.json 可能被删除'],
      actions: [
        {
          type: 'command',
          content: 'v2er alice --force',
          description: '重新生成源数据',
        },
      ],
      documentation: 'docs/data-lifecycle.md',
    };

    renderNotice(notice);

    expect(mockLogger.warn).toHaveBeenCalledWith('[DATA_RETENTION_ENABLED] 自动清理已启用');
    expect(mockLogger.detail).toHaveBeenCalledWith('raw.json 和 analyzed.json 可能被删除');
    expect(mockLogger.detail).toHaveBeenCalledWith('恢复命令: v2er alice --force');
    expect(mockLogger.detail).toHaveBeenCalledWith('文档: docs/data-lifecycle.md');
  });

  it('renders empty and informational notice lists without warnings', () => {
    renderNotices();
    renderNotices([
      {
        code: 'DATA_FILES_CLEANED',
        severity: 'info',
        summary: '没有需要恢复的影响',
      },
    ]);

    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('[DATA_FILES_CLEANED] 没有需要恢复的影响');
  });
});
