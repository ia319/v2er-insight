#!/usr/bin/env node
/**
 * CLI 入口
 */

import 'dotenv/config';
import { initFetchProxy } from '@/config';
import { program } from 'commander';
import { runFetch, runAnalyze, runAi, runShow, configProxy } from './commands';
import packageJson from '../../package.json';

// 为原生 fetch() 设置代理（AI 模块使用）
initFetchProxy();

program
  .name('v2er')
  .description('V2EX user insight - Analysis and profiling tool')
  .version(packageJson.version);

// fetch - 抓取数据
program
  .command('fetch')
  .description('Fetch user profile, topics and replies')
  .argument('<username>', 'V2EX username')
  .option('--topics', 'Fetch topics only')
  .option('--replies', 'Fetch replies only')
  .option('--force', 'Force refetch even if cache exists')
  .action(async (username, options) => {
    await runFetch(username, options);
  });

// analyze - 数据分析
program
  .command('analyze')
  .description('Process raw data and generate statistics')
  .argument('<username>', 'V2EX username')
  .action(async (username) => {
    await runAnalyze(username);
  });

// ai - AI 画像
program
  .command('ai')
  .description('Generate AI user profile and analysis')
  .argument('<username>', 'V2EX username')
  .option('--model <name>', 'Specify Gemini model')
  .action(async (username, options) => {
    await runAi(username, options);
  });

// show - 展示结果
program
  .command('show')
  .description('Show analysis report')
  .argument('<username>', 'V2EX username')
  .option('--json', 'Output raw JSON')
  .option('--brief', 'Show brief summary only')
  .action(async (username, options) => {
    await runShow(username, options);
  });

// config - 配置管理
const config = program.command('config').description('Manage configuration');

config
  .command('proxy [url]')
  .description('Set, view, or clear proxy')
  .option('--clear', 'Clear proxy setting')
  .action(configProxy);

program.parse();
