import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  BUILTIN_PROMPTS,
  getPrompts,
  savePrompts,
  getActivePromptId,
  setActivePromptId,
  getActivePromptText,
} from '../utils/prompts';

describe('prompt library', () => {
  beforeEach(() => fakeBrowser.reset());

  it('seeds the built-in prompts when storage is empty', async () => {
    expect(await getPrompts()).toEqual(BUILTIN_PROMPTS);
  });

  it('defaults the active id to the first built-in', async () => {
    expect(await getActivePromptId()).toBe(BUILTIN_PROMPTS[0]!.id);
  });

  it('returns the active prompt’s text once chosen', async () => {
    await savePrompts([{ id: 'x', name: 'X', text: 'Explain simply.' }]);
    await setActivePromptId('x');
    expect(await getActivePromptText()).toBe('Explain simply.');
  });

  it('falls back to the first prompt when the active id is missing', async () => {
    await setActivePromptId('does-not-exist');
    expect(await getActivePromptText()).toBe(BUILTIN_PROMPTS[0]!.text);
  });
});
