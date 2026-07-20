import { describe, expect, it } from 'vitest';
import { AiProviderOptionError, resolveAiProviderOptions } from '../provider-options';

describe('resolveAiProviderOptions', () => {
  it('should use the configured provider without a CLI override', () => {
    expect(resolveAiProviderOptions('codex', {})).toBe('codex');
  });

  it('should prefer a valid CLI provider override', () => {
    expect(resolveAiProviderOptions('gemini', { provider: 'codex' })).toBe('codex');
  });

  it('should reject unknown providers', () => {
    expect(() => resolveAiProviderOptions('gemini', { provider: 'other' })).toThrow(
      AiProviderOptionError,
    );
  });

  it('should reject Codex-only options for Gemini', () => {
    expect(() => resolveAiProviderOptions('gemini', { codexProject: 'D:\\Data' })).toThrowError(
      /require --provider codex/u,
    );
  });

  it('should reject Gemini thinking level for Codex', () => {
    expect(() => resolveAiProviderOptions('codex', { thinkingLevel: 'high' })).toThrowError(
      /cannot be used/u,
    );
  });
});
