/**
 * 测试 Fixture 加载工具
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 加载测试 fixture 文件
 * @param fixturesDir - fixtures 目录的绝对路径 (__dirname)
 * @param filename - fixture 文件名
 * @returns 文件内容字符串
 */
export function loadFixture(fixturesDir: string, filename: string): string {
  return readFileSync(join(fixturesDir, 'fixtures', filename), 'utf-8');
}
