/**
 * 重试工具 — 向后兼容 re-export
 *
 * 实现已迁移至 infra/retry，此文件保留以维持 core/ai 的公开 API 不变。
 */

export { withRetry } from '@/infra/retry';
export type { RetryOptions } from '@/infra/retry';
