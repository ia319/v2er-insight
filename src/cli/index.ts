#!/usr/bin/env node
/**
 * CLI 入口
 */

import 'dotenv/config';
import { program } from 'commander';
import { runFetch, runAnalyze, runAi, runShow, configProxy } from './commands';

program
  .name('v2er')
  .description('V2EX user insight - Analysis and profiling tool')
  .version('1.0.0');

// fetch - 抓取数据
program
  .command('fetch')
  .description('Fetch user profile, topics and replies')
  .argument('<username>', 'V2EX username')
  .option('--topics', 'Fetch topics only')
  .option('--replies', 'Fetch replies only')
  .option('--force', 'Force refetch even if cache exists')
  .action(runFetch);

// analyze - 数据分析
program
  .command('analyze')
  .description('Process raw data and generate statistics')
  .argument('<username>', 'V2EX username')
  .action(runAnalyze);

// ai - AI 画像
program
  .command('ai')
  .description('Generate AI user profile and analysis')
  .argument('<username>', 'V2EX username')
  .option('--model <name>', 'Specify Gemini model')
  .action(runAi);

// show - 展示结果
program
  .command('show')
  .description('Show analysis report')
  .argument('<username>', 'V2EX username')
  .option('--json', 'Output raw JSON')
  .option('--brief', 'Show brief summary only')
  .action(runShow);

// config - 配置管理
const config = program.command('config').description('Manage configuration');

config
  .command('proxy [url]')
  .description('Set, view, or clear proxy')
  .option('--clear', 'Clear proxy setting')
  .action(configProxy);

program.parse();
