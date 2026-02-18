/**
 * Gemini Provider 实现 - 多轮对话
 */

import { GoogleGenAI, Chat, ThinkingLevel as SdkThinkingLevel } from '@google/genai';
import type { ThinkingLevel } from '@/config/types/ai';
import type { IAIProvider, SessionOptions } from '../types';

export type { IAIProvider };

/**
 * 项目小写 ThinkingLevel → SDK 大写枚举的映射表
 *
 * satisfies 确保每个项目值都有对应 SDK 枚举，SDK 升级时若枚举变化会编译报错。
 */
const THINKING_LEVEL_MAP = {
  minimal: SdkThinkingLevel.MINIMAL,
  low: SdkThinkingLevel.LOW,
  medium: SdkThinkingLevel.MEDIUM,
  high: SdkThinkingLevel.HIGH,
} as const satisfies Record<ThinkingLevel, SdkThinkingLevel>;

/** 将项目 ThinkingLevel 转为 SDK 枚举值 */
function toSdkThinkingLevel(level?: ThinkingLevel): SdkThinkingLevel | undefined {
  return level ? THINKING_LEVEL_MAP[level] : undefined;
}

export class GeminiProvider implements IAIProvider {
  readonly name = 'gemini';
  private ai: GoogleGenAI;
  private model: string;
  private chat: Chat | null = null;

  constructor(apiKey: string, model: string) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Gemini API key is required');
    }
    this.model = model;
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * 创建带有系统提示词的新聊天会话
   *
   * @param systemPrompt 系统提示词，用于指导 AI 的角色和行为
   * @param options.thinkingLevel 思考等级，传入项目小写值（如 'low'），
   *   内部通过 {@link THINKING_LEVEL_MAP} 映射为 SDK 枚举后传入 thinkingConfig
   */
  createSession(systemPrompt: string, options?: SessionOptions): void {
    const sdkThinkingLevel = toSdkThinkingLevel(options?.thinkingLevel);
    const timeout = options?.timeout;

    this.chat = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: systemPrompt,
        ...(typeof timeout === 'number' && {
          httpOptions: { timeout },
        }),
        ...(sdkThinkingLevel !== undefined && {
          thinkingConfig: { thinkingLevel: sdkThinkingLevel },
        }),
      },
    });
  }

  /**
   * 发送消息并获取响应
   */
  async sendMessage(content: string): Promise<string> {
    if (!this.chat) {
      throw new Error('Chat session not created. Call createSession() first.');
    }

    const response = await this.chat.sendMessage({ message: content });

    if (!response.text) {
      throw new Error('Empty response from Gemini API');
    }

    return response.text;
  }
}
