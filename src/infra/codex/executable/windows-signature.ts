import { spawnSync } from 'child_process';
import { resolveWindowsPowerShellPath } from './windows-powershell';

const SIGNATURE_QUERY_TIMEOUT_MS = 10_000;
const SIGNATURE_OUTPUT_LIMIT = 64 * 1024;
const SIGNATURE_PATHS_ENV = 'V2ER_CODEX_SIGNATURE_PATHS';

const SIGNATURE_QUERY_SCRIPT = [
  '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
  `$paths = [Environment]::GetEnvironmentVariable('${SIGNATURE_PATHS_ENV}') | ConvertFrom-Json`,
  '$items = @($paths | ForEach-Object {',
  '  $path = [string]$_',
  '  try {',
  '    $signature = Get-AuthenticodeSignature -LiteralPath $path',
  '    $certificate = $signature.SignerCertificate',
  '    [PSCustomObject]@{',
  '      path = $path',
  '      status = $signature.Status.ToString()',
  '      publisher = if ($certificate) { $certificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) } else { $null }',
  '    }',
  '  } catch {',
  "    [PSCustomObject]@{ path = $path; status = 'Unavailable'; publisher = $null }",
  '  }',
  '})',
  '[PSCustomObject]@{ items = $items } | ConvertTo-Json -Compress -Depth 3',
].join('; ');

export interface WindowsAuthenticodeSignature {
  status: string;
  publisher: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeSignatureOutput(output: string): Map<string, WindowsAuthenticodeSignature> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch {
    return new Map();
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.items)) return new Map();

  const signatures = new Map<string, WindowsAuthenticodeSignature>();
  for (const item of parsed.items) {
    if (!isRecord(item)) continue;
    const filePath = item.path;
    const status = item.status;
    const publisher = item.publisher;
    if (
      typeof filePath !== 'string' ||
      typeof status !== 'string' ||
      (publisher !== null && typeof publisher !== 'string')
    ) {
      continue;
    }
    signatures.set(filePath.toLowerCase(), { status, publisher });
  }
  return signatures;
}

/**
 * Reads Authenticode status for native Windows candidates through system PowerShell.
 * @param filePaths - Absolute executable paths to inspect in one bounded process.
 * @param env - Host environment passed to the system PowerShell process.
 * @returns Signature observations keyed by case-insensitive Windows path.
 */
export function getWindowsAuthenticodeSignatures(
  filePaths: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Map<string, WindowsAuthenticodeSignature> {
  if (filePaths.length === 0) return new Map();
  const powershellPath = resolveWindowsPowerShellPath(env);
  if (!powershellPath) return new Map();

  const result = spawnSync(
    powershellPath,
    ['-NoProfile', '-NonInteractive', '-Command', SIGNATURE_QUERY_SCRIPT],
    {
      encoding: 'utf8',
      env: { ...env, [SIGNATURE_PATHS_ENV]: JSON.stringify(filePaths) },
      maxBuffer: SIGNATURE_OUTPUT_LIMIT,
      shell: false,
      timeout: SIGNATURE_QUERY_TIMEOUT_MS,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') return new Map();
  return decodeSignatureOutput(result.stdout);
}
