import type { CodexExecutableCandidate } from './types';

const BASE_ENVIRONMENT_KEYS = [
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'XDG_CACHE_HOME',
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'TEMP',
  'TMP',
  'TMPDIR',
  'CODEX_HOME',
  'CODEX_SQLITE_HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'CODEX_CA_CERTIFICATE',
  'SSL_CERT_FILE',
] as const;

const POSIX_PROXY_KEYS = ['http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'] as const;
const COMMAND_SHIM_KEYS = ['PATH', 'PATHEXT'] as const;

function readEnvironmentValue(
  source: NodeJS.ProcessEnv,
  key: string,
  platform: NodeJS.Platform,
): string | undefined {
  const direct = source[key];
  if (direct !== undefined || platform !== 'win32') return direct;

  const normalizedKey = key.toUpperCase();
  const actualKey = Object.keys(source).find(
    (sourceKey) => sourceKey.toUpperCase() === normalizedKey,
  );
  return actualKey === undefined ? undefined : source[actualKey];
}

function copyEnvironmentKeys(
  target: NodeJS.ProcessEnv,
  source: NodeJS.ProcessEnv,
  keys: readonly string[],
  platform: NodeJS.Platform,
): void {
  for (const key of keys) {
    const value = readEnvironmentValue(source, key, platform);
    if (value !== undefined) target[key] = value;
  }
}

/**
 * Builds the bounded environment inherited by Codex version and App Server processes.
 * @param candidate - Authorized executable whose launch form controls shim-only variables.
 * @param source - Parent environment used as the allowlisted value source.
 * @param platform - Host platform controlling case lookup and POSIX proxy aliases.
 * @returns An environment limited to runtime, home, proxy, certificate, and shim dependencies.
 */
export function createCodexProcessEnvironment(
  candidate: CodexExecutableCandidate,
  source: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  copyEnvironmentKeys(result, source, BASE_ENVIRONMENT_KEYS, platform);
  if (platform !== 'win32') {
    copyEnvironmentKeys(result, source, POSIX_PROXY_KEYS, platform);
  }
  if (candidate.kind === 'command-shim') {
    copyEnvironmentKeys(result, source, COMMAND_SHIM_KEYS, platform);
  }
  return result;
}
