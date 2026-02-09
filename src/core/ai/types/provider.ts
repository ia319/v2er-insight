/**
 * Provider 接口定义
 */

/** AI Provider 接口 */
export interface IAIProvider {
  readonly name: string;
  /** 注意：为了支持异步初始化，返回 void | Promise<void> */
  createSession(systemPrompt: string): void | Promise<void>;
  sendMessage(content: string): Promise<string>;
}
