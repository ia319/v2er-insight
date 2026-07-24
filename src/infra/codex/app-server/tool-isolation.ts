import type { CodexMcpServerStatus } from './method-types';
import type { JsonValue } from './protocol';

export const CODEX_TOOL_PROBE_SERVICE_NAME = 'v2er-insight-tool-probe';

export const BASE_THREAD_CONFIG = {
  web_search: 'disabled',
  features: {
    apps: false,
    auth_elicitation: false,
    browser_use: false,
    browser_use_external: false,
    browser_use_full_cdp_access: false,
    code_mode_host: false,
    computer_use: false,
    goals: false,
    hooks: false,
    image_generation: false,
    in_app_browser: false,
    multi_agent: false,
    plugins: false,
    remote_plugin: false,
    shell_snapshot: false,
    shell_tool: false,
    skill_mcp_dependency_install: false,
    tool_call_mcp_elicitation: false,
    tool_suggest: false,
    workspace_dependencies: false,
  },
} satisfies JsonValue;

/**
 * Builds a thread-local config that disables every MCP server exposing tools in the probe.
 * @param servers - Effective MCP inventory from an ephemeral probe thread.
 * @returns A complete thread configuration with discovered servers disabled.
 */
export function buildToolIsolatedThreadConfig(servers: readonly CodexMcpServerStatus[]): JsonValue {
  const activeServers = servers.filter((server) => server.toolNames.length > 0);
  if (activeServers.length === 0) return BASE_THREAD_CONFIG;

  return {
    ...BASE_THREAD_CONFIG,
    mcp_servers: Object.fromEntries(
      activeServers.map((server) => [server.name, { enabled: false }]),
    ),
  };
}

/**
 * Returns stable diagnostic identities for tools that remain available to a thread.
 * @param servers - Effective MCP inventory from a persisted thread.
 * @returns Server-qualified tool names.
 */
export function listAvailableMcpTools(servers: readonly CodexMcpServerStatus[]): string[] {
  return servers.flatMap((server) =>
    server.toolNames.map((toolName) => `${server.name}/${toolName}`),
  );
}
