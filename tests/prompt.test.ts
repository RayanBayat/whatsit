import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, buildUserPrompt } from '../utils/ai/prompt';

describe('buildUserPrompt', () => {
  it('leads with the selected text and labels context as disambiguation-only', () => {
    const out = buildUserPrompt({
      word: 'strike',
      title: 'Bowling 101',
      context: 'He bowled a strike.',
    });
    expect(out).toBe(
      'Selected text: "strike"\n\nSurrounding context (use only to choose the ' +
        'right meaning, do not describe it): "He bowled a strike."',
    );
  });

  it('puts the selected text first', () => {
    const out = buildUserPrompt({ word: 'immense', title: '', context: '' });
    expect(out.startsWith('Selected text: "immense"')).toBe(true);
  });
});

describe('SYSTEM_PROMPT', () => {
  it('constrains the model to explain the selection, not the topic', () => {
    expect(SYSTEM_PROMPT).toMatch(/Max 40 words/);
    expect(SYSTEM_PROMPT).toMatch(/no markdown/i);
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('selected');
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('context');
    // The anti-ramble guard that fixes the "describe the surrounding topic" bug.
    expect(SYSTEM_PROMPT).toMatch(/not summarize/i);
  });
});
