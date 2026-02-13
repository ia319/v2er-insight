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
  DEFAULT_MODEL,
  RETRY_CONFIG,
} from '@/core/ai';
import { readDataFile, writeDataFile, cleanExpiredData } from '@/infra/storage';
import { logger } from '@/infra/logger';
import type { AiCommandOptions } from '../types';

/**
 * 执行 ai 命令
 */
export async function runAi(username: string, options: AiCommandOptions): Promise<void> {
  // 读取分析数据
  const analyzed = readDataFile<AnalyzerOutput>(username, 'analyzed');

  if (!analyzed) {
    logger.error(`未找到 ${username} 的分析数据`);
    logger.info('请先运行: v2er analyze <username>');
    return;
  }

  // 解析 API Key
  const apiKey = resolveApiKey();
  if (!apiKey) {
    logger.error('未找到 API Key');
    logger.info('请通过以下方式之一配置:');
    logger.detail('1. 环境变量: GOOGLE_API_KEY 或 GEMINI_API_KEY');
    logger.detail('2. 配置文件: ~/.v2errc.json 中的 geminiApiKey');
    return;
  }

  const model = options.model ?? DEFAULT_MODEL;
  logger.info(`\nAI 分析: ${username} (模型: ${model})`);

  // 构建消息序列
  const sequence = buildMessageSequence(analyzed);
  const totalMessages = sequence.messages.length + 1; // +1 for finalPrompt

  // 创建 Provider
  const provider = new GeminiProvider(apiKey, model);

  try {
    // 初始化会话
    await provider.createSession(sequence.systemPrompt);

    // 逐条发送数据消息
    logger.section('发送数据至 AI...');
    let messageIndex = 0;
    for (const message of sequence.messages) {
      logger.progress(messageIndex, totalMessages, '发送消息');
      await withRetry(() => provider.sendMessage(message), RETRY_CONFIG);
      messageIndex++;
    }

    // 发送最终分析请求
    logger.progress(sequence.messages.length, totalMessages, '请求分析');
    const rawResponse = await withRetry(
      () => provider.sendMessage(sequence.finalPrompt),
      RETRY_CONFIG,
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
    logger.success('分析结果已保存');

    // 清理过期中间数据
    const cleaned = cleanExpiredData(username);
    if (cleaned.length > 0) {
      logger.detail(`已清理中间数据: ${cleaned.join(', ')}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`AI 分析失败: ${message}`);
  }
}
