import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createChat: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    readonly chats = { create: mocks.createChat };
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
});
