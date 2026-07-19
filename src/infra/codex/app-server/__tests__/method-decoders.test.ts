import { describe, expect, it } from 'vitest';
import { CodexAppServerProtocolError } from '../errors';
import {
  decodeAccountReadResponse,
  decodeInitializeResponse,
  decodeModelListResponse,
} from '../method-decoders';

describe('App Server method decoders', () => {
  it('should decode initialize metadata', () => {
    expect(
      decodeInitializeResponse({
        userAgent: 'codex_cli_rs/0.144.5',
        codexHome: 'C:\\Users\\test\\.codex',
        platformFamily: 'windows',
        platformOs: 'windows',
      }),
    ).toEqual({
      userAgent: 'codex_cli_rs/0.144.5',
      codexHome: 'C:\\Users\\test\\.codex',
      platformFamily: 'windows',
      platformOs: 'windows',
    });
  });

  it('should reduce account data to authentication state', () => {
    expect(
      decodeAccountReadResponse({
        account: { type: 'chatgpt', email: 'private@example.com', planType: 'plus' },
        requiresOpenaiAuth: true,
      }),
    ).toEqual({ accountType: 'chatgpt', requiresOpenaiAuth: true });
  });

  it('should decode model identity and reasoning capabilities', () => {
    expect(
      decodeModelListResponse({
        data: [
          {
            id: 'gpt-current',
            model: 'gpt-current',
            displayName: 'GPT Current',
            description: 'Current model',
            hidden: false,
            isDefault: true,
            defaultReasoningEffort: 'low',
            supportedReasoningEfforts: [
              { reasoningEffort: 'low', description: 'Fast responses' },
              { reasoningEffort: 'high', description: 'Deeper reasoning' },
            ],
          },
        ],
        nextCursor: null,
      }),
    ).toMatchObject({
      data: [
        {
          id: 'gpt-current',
          model: 'gpt-current',
          isDefault: true,
          defaultReasoningEffort: 'low',
        },
      ],
      nextCursor: null,
    });
  });

  it('should reject missing model capability fields', () => {
    expect(() =>
      decodeModelListResponse({ data: [{ id: 'incomplete' }], nextCursor: null }),
    ).toThrow(CodexAppServerProtocolError);
  });
});
