#!/usr/bin/env node
/**
 * CLI 入口
 */

import 'dotenv/config';
import { initFetchProxy, getConfig } from '@/config';
import { program } from 'commander';
import {
  runFetch,
  runAnalyze,
  runAi,
  runShow,
  runPipeline,
  configProxy,
  configShow,
  configSet,
  configReset,
} from './commands';
import { logger } from '@/infra/logger';
import packageJson from '../../package.json';

// 从配置文件初始化日志级别（必须在其他初始化之前）
const configLogLevel = getConfig().log?.level;
if (configLogLevel) {
  logger.setLevel(configLogLevel);
}

// 为原生 fetch() 设置代理（AI 模块使用）
initFetchProxy();

program
  .name('v2er')
  .description('V2EX user insight - Analysis and profiling tool')
  .version(packageJson.version);

// 主命令 - 一键分析
program
  .argument('[username]', 'V2EX username')
  .option('--force', 'Force re-fetch from scratch')
  .option('--model [name]', 'Specify AI model (or select interactively)')
  .option('--thinking-level [level]', 'Specify thinking level (or select interactively)')
  .option('-v, --verbose', 'Show debug output')
  .action(async (username, options, command) => {
    if (!username) {
      command.help();
      return;
    }
    await runPipeline(username, options);
  });

// fetch - 抓取数据
// NOTE: 子命令仅对 failed 设置 exitCode=1，partial 视为可接受的降级成功（exitCode=0）。
// 这与 pipeline 模式不同（partial 会导致 exitCode=1），因为 pipeline 中 partial 影响后续步骤质量。
program
  .command('fetch')
  .description('Fetch user profile, topics and replies')
  .argument('<username>', 'V2EX username')
  .option('--topics', 'Fetch topics only')
  .option('--replies', 'Fetch replies only')
  .option('--force', 'Force refetch even if cache exists')
  .option('-v, --verbose', 'Show debug output')
  .action(async (username, _, command) => {
    const opts = command.optsWithGlobals();
    if (opts.verbose) logger.setLevel('debug');
    const result = await runFetch(username, opts);
    if (result.status === 'failed') process.exitCode = 1;
  });

// analyze - 数据分析
program
  .command('analyze')
  .description('Process raw data and generate statistics')
  .argument('<username>', 'V2EX username')
  .option('-v, --verbose', 'Show debug output')
  .action(async (username, _, command) => {
    const opts = command.optsWithGlobals();
    if (opts.verbose) logger.setLevel('debug');
    const result = await runAnalyze(username);
    if (result.status === 'failed') process.exitCode = 1;
  });

// ai - AI 画像
program
  .command('ai')
  .description('Generate AI user profile and analysis')
  .argument('<username>', 'V2EX username')
  .option('--model [name]', 'Specify Gemini model (or select interactively)')
  .option('--thinking-level [level]', 'Specify thinking level: minimal | low | medium | high')
  .option('-v, --verbose', 'Show debug output')
  .action(async (username, _, command) => {
    const opts = command.optsWithGlobals();
    if (opts.verbose) logger.setLevel('debug');
    const result = await runAi(username, opts);
    if (result.status === 'failed') process.exitCode = 1;
  });

// show - 展示结果
program
  .command('show')
  .description('Show analysis report')
  .argument('<username>', 'V2EX username')
  .option('--json', 'Output raw JSON')
  .option('--brief', 'Show brief summary only')
  .option('-v, --verbose', 'Show debug output')
  .action(async (username, _options, command) => {
    const opts = command.optsWithGlobals();
    if (opts.verbose) logger.setLevel('debug');
    const result = await runShow(username, opts);
    if (result.status === 'failed') process.exitCode = 1;
  });

// config - 配置管理
const config = program.command('config').description('Manage configuration');

config
  .command('proxy [url]')
  .description('Set, view, or clear proxy')
  .option('--clear', 'Clear proxy setting')
  .action(configProxy);

config.command('show [group]').description('Show current configuration').action(configShow);

config
  .command('set <path> <value>')
  .description('Set a configuration value (e.g. ai.model gemini-2.5-flash)')
  .action(configSet);

config
  .command('reset [group]')
  .description('Reset configuration to defaults (all or specific group)')
  .action(configReset);

program.parse();
