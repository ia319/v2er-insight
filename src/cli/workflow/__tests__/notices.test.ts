import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserNotice } from '../types';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  diagnostic: vi.fn(),
}));

vi.mock('@/infra/logger', () => ({ logger: mockLogger }));

import { renderNotice, renderNotices } from '../notices';
import {
  createDataFilesCleanedNotice,
  createDataRetentionEnabledNotice,
} from '../data-retention-notices';
import { createResultStateNotices } from '../result-state-notices';

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
        {
          type: 'instruction',
          content: '确认外部会话仍保留完整数据',
          description: '避免把已清理的本地文件解释为数据缺失',
        },
      ],
      documentation: 'docs/data-lifecycle.md',
    };

    renderNotice(notice);

    expect(mockLogger.warn).toHaveBeenCalledWith('[DATA_RETENTION_ENABLED] 自动清理已启用');
    expect(mockLogger.diagnostic).toHaveBeenCalledWith(
      'warn',
      '  raw.json 和 analyzed.json 可能被删除',
    );
    expect(mockLogger.diagnostic).toHaveBeenCalledWith('warn', '  恢复命令: v2er alice --force');
    expect(mockLogger.diagnostic).toHaveBeenCalledWith(
      'warn',
      '  恢复操作: 确认外部会话仍保留完整数据',
    );
    expect(mockLogger.diagnostic).toHaveBeenCalledWith('warn', '  文档: docs/data-lifecycle.md');
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
    expect(mockLogger.diagnostic).toHaveBeenCalledWith(
      'info',
      '[DATA_FILES_CLEANED] 没有需要恢复的影响',
    );
  });
});

describe('data retention notices', () => {
  it('describes cleanup scope and recovery when retention is enabled', () => {
    const notice = createDataRetentionEnabledNotice(7);

    expect(notice).toMatchObject({
      code: 'DATA_RETENTION_ENABLED',
      severity: 'warning',
      summary: expect.stringContaining('7 天'),
      documentation: 'docs/data-lifecycle.md',
    });
    expect(notice.details?.join(' ')).toContain('result.json');
    expect(notice.details?.join(' ')).toContain('外部会话');
    expect(notice.actions?.[0]?.content).toBe('v2er <username> --force');
  });

  it('creates a cleanup notice only when source files were deleted', () => {
    expect(
      createDataFilesCleanedNotice('alice', {
        enabled: true,
        retentionDays: 1,
        deleted: [],
        skipped: [],
      }),
    ).toBeNull();

    const notice = createDataFilesCleanedNotice('alice', {
      enabled: true,
      retentionDays: 1,
      deleted: ['raw', 'analyzed'],
      skipped: [],
    });

    expect(notice?.code).toBe('DATA_FILES_CLEANED');
    expect(notice?.summary).toContain('raw.json、analyzed.json');
    expect(notice?.actions?.[0]?.content).toBe('v2er alice --force');
  });
});

describe('result state notices', () => {
  it('returns no notice without current-result provenance', () => {
    expect(createResultStateNotices('alice')).toEqual([]);
  });

  it('keeps stale and partial effects as separate stable notices', () => {
    const notices = createResultStateNotices('alice', {
      analysisFingerprint: 'a'.repeat(64),
      stale: true,
      basedOnPartial: true,
      resultVersionId: null,
    });

    expect(notices.map((notice) => notice.code)).toEqual([
      'DATA_RESULT_STALE',
      'DATA_SNAPSHOT_PARTIAL',
    ]);
    expect(notices[0]?.actions?.[0]?.content).toBe('v2er alice --force');
    expect(notices[1]?.details?.[0]).toContain('缺失记录状态未知');
  });
});
