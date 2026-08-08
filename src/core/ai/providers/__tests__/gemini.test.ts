import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createChat: vi.fn(),
  sendMessage: vi.fn(),
  getModel: vi.fn(),
  countTokens: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    readonly chats = { create: mocks.createChat };
    readonly models = { get: mocks.getModel, countTokens: mocks.countTokens };
  },
  ThinkingLevel: {
    MINIMAL: 'MINIMAL',
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
  },
}));

import { GeminiProvider } from '../gemini';

describe('GeminiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createChat.mockReturnValue({ sendMessage: mocks.sendMessage });
    mocks.sendMessage.mockResolvedValue({ text: 'new response' });
    mocks.getModel.mockResolvedValue({ inputTokenLimit: 100 });
    mocks.countTokens.mockResolvedValue({ totalTokens: 91 });
  });

  it('creates a chat with completed history and sends only the new message', async () => {
    const provider = new GeminiProvider('secret', 'gemini-current');
    const history = [
      { role: 'user' as const, parts: [{ text: 'old request' }] },
      { role: 'model' as const, parts: [{ text: 'old response' }] },
    ];

    provider.createSession('Analyze safely.', {
      thinkingLevel: 'high',
      timeout: 30_000,
      history,
    });
    await expect(provider.sendMessage('new request')).resolves.toBe('new response');

    expect(mocks.createChat).toHaveBeenCalledWith({
      model: 'gemini-current',
      history,
      config: {
        systemInstruction: 'Analyze safely.',
        httpOptions: { timeout: 30_000 },
        thinkingConfig: { thinkingLevel: 'HIGH' },
      },
    });
    expect(mocks.sendMessage).toHaveBeenCalledOnce();
    expect(mocks.sendMessage).toHaveBeenCalledWith({ message: 'new request' });
  });

  it('rejects an empty provider response', async () => {
    const provider = new GeminiProvider('secret', 'gemini-current');
    mocks.sendMessage.mockResolvedValue({ text: '' });
    provider.createSession('Analyze safely.');

    await expect(provider.sendMessage('new request')).rejects.toThrow(
      'Empty response from Gemini API',
    );
  });

  it('counts the complete reconstructed request before sending', async () => {
    const provider = new GeminiProvider('secret', 'gemini-current');
    const history = [
      { role: 'user' as const, parts: [{ text: 'old request' }] },
      { role: 'model' as const, parts: [{ text: 'old response' }] },
    ];

    await expect(
      provider.inspectContext('Analyze safely.', 'new request', {
        history,
        timeout: 30_000,
      }),
    ).resolves.toEqual({
      source: 'sdk',
      used: 91,
      limit: 100,
      nearLimit: true,
      tooLong: false,
    });
    expect(mocks.countTokens).toHaveBeenCalledWith({
      model: 'gemini-current',
      contents: [...history, { role: 'user', parts: [{ text: 'new request' }] }],
      config: {
        systemInstruction: 'Analyze safely.',
        httpOptions: { timeout: 30_000 },
      },
    });
  });

  it('uses a conservative byte estimate when SDK inspection is unavailable', async () => {
    const provider = new GeminiProvider('secret', 'gemini-current');
    mocks.getModel.mockRejectedValue(new Error('metadata unavailable'));

    const result = await provider.inspectContext('instruction', 'message');

    expect(result.source).toBe('fallback');
    expect(result.used).toBe(Buffer.byteLength('instruction\n\nmessage', 'utf-8'));
    expect(result.limit).toBe(500_000);
  });
});
