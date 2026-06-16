import { describe, it, expect } from 'vitest';
import { provider } from '../utils/ai';
import { chromeProvider } from '../utils/ai/chrome';

describe('provider selection', () => {
  it('exposes startConversation (satisfies the AiProvider contract)', () => {
    expect(typeof provider.startConversation).toBe('function');
  });

  it('defaults to the Chrome provider in the test (chrome) env', () => {
    expect(provider).toBe(chromeProvider);
  });
});

describe('chromeProvider when LanguageModel is absent (as in the test env)', () => {
  it('prewarm is a safe no-op', () => {
    expect(() => chromeProvider.prewarm?.()).not.toThrow();
  });

  it('startConversation rejects with a clear "AI unavailable" error', async () => {
    await expect(chromeProvider.startConversation()).rejects.toThrow(/available/i);
  });
});
