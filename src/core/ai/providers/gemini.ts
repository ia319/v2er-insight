/**
 * Gemini Provider Implementation - Multi-turn Chat
 */

import { GoogleGenAI, Chat } from '@google/genai';

/** Provider interface for future extensibility */
export interface IAIProvider {
  readonly name: string;
  createSession(systemPrompt: string): void;
  sendMessage(content: string): Promise<string>;
}

export class GeminiProvider implements IAIProvider {
  readonly name = 'gemini';
  private ai: GoogleGenAI;
  private model: string;
  private chat: Chat | null = null;

  constructor(apiKey: string, model: string) {
    this.model = model;
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Create a new chat session with system prompt
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
   * Send a message and get response
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
