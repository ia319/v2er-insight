import os from 'os';
import path from 'path';

const CONFIG_FILE = '.v2errc.json';

/**
 * 返回配置文件完整路径
 */
export function getConfigPath(): string {
  return path.join(os.homedir(), CONFIG_FILE);
}
