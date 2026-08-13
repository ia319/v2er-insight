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
import { AIResultParseError } from '../result-parser';
import type { AIResultJsonSchema } from '../result-schema';
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

const CONTEXT_WARNING_RATIO = 0.9;

export type GeminiContextInspection =
  | {
      status: 'verified';
      source: 'sdk';
      used: number;
      limit: number;
      nearLimit: boolean;
      tooLong: boolean;
    }
  | {
      status: 'unverified';
      reason: 'model_metadata_or_token_count_unavailable';
    };

export interface GeminiStructuredMessageOptions {
  systemInstruction: string;
  thinkingLevel: ThinkingLevel;
  timeout: number;
  responseJsonSchema: AIResultJsonSchema;
}

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

function inspectUsage(used: number, limit: number): GeminiContextInspection {
  const ratio = used / limit;
  return {
    status: 'verified',
    source: 'sdk',
    used,
    limit,
    nearLimit: ratio >= CONTEXT_WARNING_RATIO,
    tooLong: used >= limit,
  };
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
   * Measures the next complete request against the model input limit.
   * @param systemPrompt - Fixed instruction sent with every reconstructed request.
   * @param message - New user text that will be appended to the completed history.
   * @param options - Persisted history and request timeout.
   * @returns Verified SDK token usage or an explicit unverified status.
   */
  async inspectContext(
    systemPrompt: string,
    message: string,
    options?: Pick<SessionOptions, 'history' | 'timeout'>,
  ): Promise<GeminiContextInspection> {
    const history = toSdkHistory(options?.history);
    const contents: Content[] = [...history, { role: 'user', parts: [{ text: message }] }];

    try {
      const [model, count] = await Promise.all([
        this.ai.models.get({
          model: this.model,
          ...(typeof options?.timeout === 'number'
            ? { config: { httpOptions: { timeout: options.timeout } } }
            : {}),
        }),
        this.ai.models.countTokens({
          model: this.model,
          contents,
          config: {
            systemInstruction: systemPrompt,
            ...(typeof options?.timeout === 'number'
              ? { httpOptions: { timeout: options.timeout } }
              : {}),
          },
        }),
      ]);
      if (
        typeof model.inputTokenLimit === 'number' &&
        model.inputTokenLimit > 0 &&
        typeof count.totalTokens === 'number' &&
        count.totalTokens >= 0
      ) {
        return inspectUsage(count.totalTokens, model.inputTokenLimit);
      }
    } catch {
      // Failing closed prevents a transient SDK failure from bypassing context validation.
    }

    return { status: 'unverified', reason: 'model_metadata_or_token_count_unavailable' };
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

  /**
   * Sends one analysis turn with a strict request-level JSON response contract.
   * @param content - Complete Analyzer payload for the analysis turn.
   * @param options - Complete request config and expected response schema.
   * @returns The structured response text for strict runtime validation.
   * @throws {AIResultParseError} When Gemini returns no structured response text.
   */
  async sendStructuredMessage(
    content: string,
    options: GeminiStructuredMessageOptions,
  ): Promise<string> {
    if (!this.chat) {
      throw new Error('Chat session not created. Call createSession() first.');
    }

    // Gemini request config replaces the chat config, so copy every analysis setting explicitly.
    const response = await this.chat.sendMessage({
      message: content,
      config: {
        systemInstruction: options.systemInstruction,
        httpOptions: { timeout: options.timeout },
        thinkingConfig: { thinkingLevel: toSdkThinkingLevel(options.thinkingLevel) },
        responseMimeType: 'application/json',
        responseJsonSchema: options.responseJsonSchema,
      },
    });

    if (!response.text) {
      throw new AIResultParseError('invalid_result', 'Gemini returned an empty analysis result');
    }

    return response.text;
  }
}
