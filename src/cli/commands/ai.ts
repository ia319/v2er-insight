/**
 * ai 命令 — 调用 AI 分析用户数据
 *
 * 读取 analyzed.json，构建多轮对话消息序列，
 * 通过 GeminiProvider 发送至 AI，解析响应后写入 result.json。
 */

import type { AnalyzerOutput } from '@/core/analyzer';
import {
  GeminiProvider,
  buildMessageSequence,
  parseResponse,
  resolveApiKey,
  withRetry,
} from '@/core/ai';
import { getConfig, THINKING_LEVELS } from '@/config';
import type { ThinkingLevel } from '@/config';
import { readDataFile, writeDataFile, cleanExpiredData } from '@/infra/storage';
import { logger } from '@/infra/logger';
import type { AiCommandOptions } from '../types';
import { getRecoveryActions } from '../workflow/recovery';
import type { StepRunResult } from '../workflow/types';

/**
 * 执行 ai 命令
 */
export async function runAi(username: string, options: AiCommandOptions): Promise<StepRunResult> {
  // 读取分析数据
  const analyzed = readDataFile<AnalyzerOutput>(username, 'analyzed');

  if (!analyzed) {
    logger.error(`未找到 ${username} 的分析数据`);
    logger.info('请先运行: v2er analyze <username>');
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_INPUT_MISSING',
      message: '缺少 analyzed.json，无法执行 AI 分析',
      recoverable: true,
      recoverActions: getRecoveryActions('AI_INPUT_MISSING', { username }),
    };
  }

  // 解析 API Key
  const apiKey = resolveApiKey();
  if (!apiKey) {
    logger.error('未找到 API Key');
    logger.info('请通过以下方式之一配置:');
    logger.detail('1. 环境变量: GOOGLE_API_KEY 或 GEMINI_API_KEY');
    logger.detail('2. 配置文件: v2er config ai.apiKey <key>');
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_API_KEY_MISSING',
      message: '缺少 API Key，无法发起 AI 请求',
      recoverable: true,
      recoverActions: getRecoveryActions('AI_API_KEY_MISSING', { username }),
    };
  }

  const config = getConfig();

  // Commander 将 --model [name] 无值时解析为 true；
  // 字符串时直接使用，否则回退到配置/默认值（后续支持交互选择时替换此逻辑）
  const model =
    typeof options.model === 'string'
      ? options.model
      : (config.ai?.model ?? 'gemini-3-pro-preview');

  // 同上：--thinking-level [level] 无值时为 true，字符串时直接使用
  const rawThinkingLevel =
    typeof options.thinkingLevel === 'string' ? options.thinkingLevel : config.ai?.thinkingLevel;

  // 校验 thinkingLevel 合法性
  if (rawThinkingLevel && !THINKING_LEVELS.includes(rawThinkingLevel as ThinkingLevel)) {
    logger.error(`无效的思考等级: "${rawThinkingLevel}"`);
    logger.info(`可选值: ${THINKING_LEVELS.join(' | ')}`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_INVALID_THINKING_LEVEL',
      message: `无效的 thinkingLevel: ${rawThinkingLevel}`,
      recoverable: false,
    };
  }
  const thinkingLevel = rawThinkingLevel as ThinkingLevel | undefined;

  logger.info(`\nAI 分析: ${username} (模型: ${model})`);
  if (thinkingLevel) {
    logger.detail(`思考等级: ${thinkingLevel}`);
  }

  // 构建消息序列
  const sequence = buildMessageSequence(analyzed);
  const totalMessages = sequence.messages.length + 1; // +1 for finalPrompt

  // 创建 Provider
  const provider = new GeminiProvider(apiKey, model);

  const retryOptions = {
    maxRetries: config.ai?.maxRetries,
    baseDelay: config.ai?.baseDelay,
    maxDelay: config.ai?.maxDelay,
  };

  try {
    // 初始化会话
    await provider.createSession(sequence.systemPrompt, { thinkingLevel });

    // 逐条发送数据消息
    logger.section('发送数据至 AI...');
    let messageIndex = 0;
    for (const message of sequence.messages) {
      logger.progress(messageIndex, totalMessages, '发送消息');
      await withRetry(() => provider.sendMessage(message), retryOptions);
      messageIndex++;
    }

    // 发送最终分析请求
    logger.progress(sequence.messages.length, totalMessages, '请求分析');
    const rawResponse = await withRetry(
      () => provider.sendMessage(sequence.finalPrompt),
      retryOptions,
    );

    // 解析响应
    const { data: result, warnings } = parseResponse(rawResponse);

    if (warnings.length > 0) {
      logger.section('AI 响应警告:');
      for (const warning of warnings) {
        logger.warn(`  ${warning}`);
      }
    }

    // 持久化结果
    writeDataFile(username, 'result', result);

    // 清理过期中间数据
    const cleaned = cleanExpiredData(username);

    if (!options.pipeline) {
      logger.success('分析结果已保存');
      if (cleaned.length > 0) {
        logger.detail(`已清理中间数据: ${cleaned.join(', ')}`);
      }
    }

    return {
      step: 'ai',
      status: 'success',
      message: 'AI 分析完成',
      meta: {
        model,
        warningCount: warnings.length,
        cleanedFiles: cleaned,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`AI 分析失败: ${message}`);
    return {
      step: 'ai',
      status: 'failed',
      reasonCode: 'AI_PROVIDER_FAILED',
      message: `AI 分析失败: ${message}`,
      recoverable: true,
      recoverActions: getRecoveryActions('AI_PROVIDER_FAILED', { username }),
    };
  }
}
