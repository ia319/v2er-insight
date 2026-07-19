import { describe, expect, it } from 'vitest';
import { computeProviderStateKey } from '../provider-state-key';

const baseInput = {
  provider: 'gemini',
  model: 'gemini-3.1-pro-preview',
  systemPrompt: 'Analyze the supplied profile.',
  thinkingLevel: 'high',
  sessionKey: 'default',
};

describe('computeProviderStateKey', () => {
  it('returns the same key for the same logical delivery target', () => {
    expect(computeProviderStateKey(baseInput)).toBe(computeProviderStateKey({ ...baseInput }));
    expect(computeProviderStateKey(baseInput)).toMatch(/^gemini:[a-f0-9]{64}$/);
  });

  it.each(['model', 'systemPrompt', 'thinkingLevel', 'sessionKey'] as const)(
    'changes when %s changes',
    (field) => {
      expect(
        computeProviderStateKey({
          ...baseInput,
          [field]: `${baseInput[field]}-changed`,
        }),
      ).not.toBe(computeProviderStateKey(baseInput));
    },
  );

  it('keeps different providers in separate namespaces', () => {
    const key = computeProviderStateKey(baseInput);
    const otherProviderKey = computeProviderStateKey({ ...baseInput, provider: 'codex' });

    expect(otherProviderKey).not.toBe(key);
    expect(otherProviderKey).toMatch(/^codex:/);
  });

  it('supports targets without optional thinking or session identity', () => {
    expect(
      computeProviderStateKey({
        provider: 'gemini',
        model: 'gemini-3.1-pro-preview',
        systemPrompt: 'Analyze the supplied profile.',
      }),
    ).toMatch(/^gemini:[a-f0-9]{64}$/);
  });
});
