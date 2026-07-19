import type { CodexThreadRegistryV1 } from './thread-state';

export type CodexRegistryUpdate = (
  update: (registry: CodexThreadRegistryV1) => CodexThreadRegistryV1,
) => CodexThreadRegistryV1 | Promise<CodexThreadRegistryV1>;
