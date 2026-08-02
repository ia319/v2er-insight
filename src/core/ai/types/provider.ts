/**
 * Provider 接口定义
 */

import type { ThinkingLevel } from '@/config/types/ai';
import type { ProviderNeutralMessage } from '../sessions/types';

/** createSession 可选参数 */
export interface SessionOptions {
  /** 思考等级 */
  thinkingLevel?: ThinkingLevel;
  /** 请求超时（毫秒） */
  timeout?: number;
  /** Previously completed user/model turns supplied directly to the provider session. */
  history?: readonly ProviderNeutralMessage[];
}

/** AI Provider 接口 */
export interface IAIProvider {
  readonly name: string;
  /** 注意：为了支持异步初始化，返回 void | Promise<void> */
  createSession(systemPrompt: string, options?: SessionOptions): void | Promise<void>;
  sendMessage(content: string): Promise<string>;
}
