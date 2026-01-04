#!/usr/bin/env node
/**
 * CLI 入口
 */

import 'dotenv/config';

import { program } from 'commander';
import { fetchUser, configProxy } from './commands';

// 主命令：抓取用户数据
program.name('v2er').description('V2EX user data fetcher').version('1.0.0');

// 默认命令：v2er <username>
program
  .argument('<username>', 'V2EX username to fetch')
  .option('--topics', 'Fetch topics only')
  .option('--replies', 'Fetch replies only')
  .action(fetchUser);

// 配置子命令：v2er config proxy
const config = program.command('config').description('Manage configuration');

config
  .command('proxy [url]')
  .description('Set, view, or clear proxy')
  .option('--clear', 'Clear proxy setting')
  .action(configProxy);

program.parse();
