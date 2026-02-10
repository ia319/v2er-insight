/**
 * Gemini Provider 实现 - 多轮对话
 */

import { GoogleGenAI, Chat } from '@google/genai';
import type { IAIProvider } from '../types';

export type { IAIProvider };

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
   */
  createSession(systemPrompt: string): void {
    this.chat = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: systemPrompt,
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
