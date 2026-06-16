import { describe, it, expect } from 'vitest';
import { parseGeneration } from '../utils/ai/firefox';

const PROMPT = 'SYS\n\nSelected: "x"\n\nExplanation:';

describe('parseGeneration', () => {
  it('reads generated_text from the Transformers.js array shape', () => {
    expect(parseGeneration([{ generated_text: 'A fruit.' }], 'P')).toBe('A fruit.');
  });

  it('reads generated_text from an object', () => {
    expect(parseGeneration({ generated_text: 'A fruit.' }, 'P')).toBe('A fruit.');
  });

  it('accepts a plain string', () => {
    expect(parseGeneration('A fruit.', 'P')).toBe('A fruit.');
  });

  it('strips an echoed prompt prefix', () => {
    const raw = [{ generated_text: `${PROMPT} The pin-clearing throw.` }];
    expect(parseGeneration(raw, PROMPT)).toBe('The pin-clearing throw.');
  });

  it('takes text after the last "Explanation:" marker when present', () => {
    expect(parseGeneration('noise Explanation: the answer', 'P')).toBe('the answer');
  });

  it('reads the assistant turn from a chat-templated message list', () => {
    const raw = [
      {
        generated_text: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'Selected: "strike"' },
          { role: 'assistant', content: 'In bowling, knocking down all ten pins.' },
        ],
      },
    ];
    expect(parseGeneration(raw, 'Selected: "strike"')).toBe(
      'In bowling, knocking down all ten pins.',
    );
  });

  it('falls back across summary_text and translation_text', () => {
    expect(parseGeneration([{ summary_text: 'sum' }], 'P')).toBe('sum');
    expect(parseGeneration([{ translation_text: 'tr' }], 'P')).toBe('tr');
  });

  it('returns an empty string for unknown or empty shapes', () => {
    expect(parseGeneration(null, 'P')).toBe('');
    expect(parseGeneration([], 'P')).toBe('');
    expect(parseGeneration({}, 'P')).toBe('');
    expect(parseGeneration(42, 'P')).toBe('');
  });
});
