import type { FailurePolicy } from './types';

/** partial 状态下的默认策略 */
export const DEFAULT_FAILURE_POLICY: FailurePolicy = 'continue';

/**
 * 解析失败策略字符串。
 *
 * 对无效值回退到默认策略，保证编排层分支判断稳定。
 */
export function parseFailurePolicy(input?: string): FailurePolicy {
  if (input === 'continue' || input === 'stop') {
    return input;
  }
  return DEFAULT_FAILURE_POLICY;
}

/**
 * 根据策略判断 partial 是否应当中断流程。
 */
export function shouldStopOnPartial(policy: FailurePolicy): boolean {
  return policy === 'stop';
}
