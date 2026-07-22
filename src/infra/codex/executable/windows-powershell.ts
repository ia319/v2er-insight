import fs from 'fs';
import path from 'path';

const POWERSHELL_RELATIVE_PATH = 'System32\\WindowsPowerShell\\v1.0\\powershell.exe';

/**
 * Resolves the system Windows PowerShell executable without using PATH lookup.
 * @param env - Host environment containing the Windows system directory.
 * @param isFile - Injectable file check used to validate the resolved executable.
 * @returns The absolute executable path, or null when it cannot be validated.
 */
export function resolveWindowsPowerShellPath(
  env: NodeJS.ProcessEnv = process.env,
  isFile: (filePath: string) => boolean = (filePath) => {
    try {
      return fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  },
): string | null {
  const systemRoot = env.SystemRoot ?? env.WINDIR;
  if (!systemRoot || !path.win32.isAbsolute(systemRoot)) return null;

  const executablePath = path.win32.join(systemRoot, POWERSHELL_RELATIVE_PATH);
  return isFile(executablePath) ? executablePath : null;
}
