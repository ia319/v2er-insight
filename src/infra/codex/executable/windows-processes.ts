import { spawnSync } from 'child_process';

const PROCESS_QUERY_TIMEOUT_MS = 5000;

const PROCESS_PATH_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
  "$names = @('ChatGPT', 'codex')",
  'Get-Process -Name $names -ErrorAction SilentlyContinue | ForEach-Object {',
  '  try { if ($_.Path) { $_.Path } } catch {}',
  '}',
].join('; ');

/**
 * Parses newline-delimited executable paths emitted by the Windows process query.
 * @param output - UTF-8 PowerShell stdout.
 * @returns Unique non-empty process paths in observation order.
 */
export function parseWindowsProcessPaths(output: string): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const line of output.split(/\r?\n/u)) {
    const value = line.trim();
    const key = value.toLowerCase();
    if (value === '' || seen.has(key)) continue;
    seen.add(key);
    paths.push(value);
  }

  return paths;
}

/**
 * Reads executable paths through read-only inspection of running ChatGPT and Codex processes.
 * @returns Process paths available to the current Windows account.
 */
export function getWindowsCodexProcessPaths(): string[] {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', PROCESS_PATH_SCRIPT],
    {
      encoding: 'utf8',
      shell: false,
      timeout: PROCESS_QUERY_TIMEOUT_MS,
      windowsHide: true,
    },
  );

  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') return [];
  return parseWindowsProcessPaths(result.stdout);
}
