import fs from 'fs';
import path from 'path';

const COMMAND_PROCESSOR_RELATIVE_PATH = 'System32\\cmd.exe';

/**
 * Resolves the system Windows command processor without accepting ComSpec overrides.
 * @param env - Host environment containing the Windows system directory.
 * @param isFile - Injectable file check used to validate the resolved executable.
 * @returns The absolute executable path, or null when it cannot be validated.
 */
export function resolveWindowsCommandProcessorPath(
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

  const executablePath = path.win32.join(systemRoot, COMMAND_PROCESSOR_RELATIVE_PATH);
  return isFile(executablePath) ? executablePath : null;
}
