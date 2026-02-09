/**
 * Gemini Provider Implementation
 */

import { GoogleGenAI } from '@google/genai';

/** Provider interface for future extensibility */
export interface IAIProvider {
  readonly name: string;
  complete(prompt: string, systemPrompt: string): Promise<string>;
}

export class GeminiProvider implements IAIProvider {
  readonly name = 'gemini';
  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.model = model;
    this.ai = new GoogleGenAI({ apiKey });
  }

  async complete(prompt: string, systemPrompt: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    if (!response.text) {
      throw new Error('Empty response from Gemini API');
    }

    return response.text;
  }
}
