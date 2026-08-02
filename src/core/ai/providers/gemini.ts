/**
 * Gemini Provider 实现 - 多轮对话
 */

import {
  GoogleGenAI,
  ThinkingLevel as SdkThinkingLevel,
  type Chat,
  type Content,
} from '@google/genai';
import type { ThinkingLevel } from '@/config/types/ai';
import type { ProviderNeutralMessage } from '../sessions/types';
import type { IAIProvider, SessionOptions } from '../types';

export type { IAIProvider };

/**
 * 项目小写 ThinkingLevel → SDK 大写枚举的映射表
 *
 * satisfies 确保每个项目值都有对应 SDK 枚举，SDK 升级时若枚举变化会编译报错。
 * 注意：只将此映射用于枚举覆盖校验，不要将其视为模型级兼容性保证。
 * 例如，部分 Gemini 3 Pro 变体可能只接受 low/high，而 Flash 变体支持
 * minimal/low/medium/high。发起请求前请先校验模型与等级组合，否则运行时仍可能失败。
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

function toSdkHistory(history: readonly ProviderNeutralMessage[] | undefined): Content[] {
  return (history ?? []).map((message) => ({
    role: message.role,
    parts: message.parts.map((part) => ({ text: part.text })),
  }));
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
   * Creates a Gemini chat from one logical system instruction and completed local history.
   * @param systemPrompt - Fixed instruction for the logical session.
   * @param options - Thinking level, timeout, and validated provider-neutral history.
   * @returns Nothing after the local SDK chat is ready.
   */
  createSession(systemPrompt: string, options?: SessionOptions): void {
    const sdkThinkingLevel = toSdkThinkingLevel(options?.thinkingLevel);
    const timeout = options?.timeout;

    this.chat = this.ai.chats.create({
      model: this.model,
      history: toSdkHistory(options?.history),
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
