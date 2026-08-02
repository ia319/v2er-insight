import { AI_PROVIDERS, type AIProviderId } from '@/config';
import type { AiCommandOptions } from '../../types';

export type AiProviderOptionErrorCode = 'invalid_provider' | 'option_not_supported';

/** Reports an invalid provider name or an option owned by a different provider. */
export class AiProviderOptionError extends Error {
  readonly code: AiProviderOptionErrorCode;

  constructor(code: AiProviderOptionErrorCode, message: string) {
    super(message);
    this.name = 'AiProviderOptionError';
    this.code = code;
  }
}

function isAIProviderId(value: string): value is AIProviderId {
  return AI_PROVIDERS.some((provider) => provider === value);
}

/**
 * Resolves the selected provider and validates provider-specific CLI options.
 * @param configuredProvider - Provider selected by persistent configuration.
 * @param options - Per-command provider and generation overrides.
 * @returns The validated provider ID.
 * @throws {AiProviderOptionError} When the provider or option combination is invalid.
 */
export function resolveAiProviderOptions(
  configuredProvider: string,
  options: AiCommandOptions,
): AIProviderId {
  const provider = options.provider ?? configuredProvider;
  if (!isAIProviderId(provider)) {
    throw new AiProviderOptionError(
      'invalid_provider',
      `Invalid AI provider "${provider}"; expected ${AI_PROVIDERS.join(' | ')}`,
    );
  }

  if (
    provider === 'gemini' &&
    (options.reasoningEffort !== undefined || options.codexProject !== undefined)
  ) {
    throw new AiProviderOptionError(
      'option_not_supported',
      'Codex options require --provider codex',
    );
  }
  if (provider === 'codex' && options.thinkingLevel !== undefined) {
    throw new AiProviderOptionError(
      'option_not_supported',
      'Gemini --thinking-level cannot be used with the Codex provider',
    );
  }
  return provider;
}
