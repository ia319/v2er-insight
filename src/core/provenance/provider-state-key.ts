import { hashCanonicalJson } from './canonical-json';

export interface ProviderStateKeyInput {
  provider: string;
  model: string;
  systemPrompt: string;
  thinkingLevel?: string;
  sessionKey?: string;
}

/**
 * Build a stable state key for one logical provider delivery target.
 *
 * @param input - Provider, model, prompt, thinking, and optional session identity.
 * @returns A provider-prefixed key safe for use in analysis-state.json.
 */
export function computeProviderStateKey(input: ProviderStateKeyInput): string {
  const identity = {
    provider: input.provider,
    model: input.model,
    systemPrompt: input.systemPrompt,
    ...(input.thinkingLevel === undefined ? {} : { thinkingLevel: input.thinkingLevel }),
    ...(input.sessionKey === undefined ? {} : { sessionKey: input.sessionKey }),
  };

  return `${input.provider}:${hashCanonicalJson(identity)}`;
}
