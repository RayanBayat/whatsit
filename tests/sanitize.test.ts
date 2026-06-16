import { describe, it, expect } from 'vitest';
import { sanitizeLookup, LIMITS } from '../utils/sanitize';

describe('sanitizeLookup', () => {
  it('returns null when there is no usable word', () => {
    expect(sanitizeLookup({ word: '' })).toBeNull();
    expect(sanitizeLookup({})).toBeNull();
    expect(sanitizeLookup(null)).toBeNull();
    expect(sanitizeLookup(undefined)).toBeNull();
  });

  it('caps each field at its limit', () => {
    const r = sanitizeLookup({
      word: 'a'.repeat(500),
      context: 'b'.repeat(2000),
      title: 'c'.repeat(500),
    });
    expect(r).not.toBeNull();
    expect(r!.word).toHaveLength(LIMITS.word);
    expect(r!.context).toHaveLength(LIMITS.context);
    expect(r!.title).toHaveLength(LIMITS.title);
  });

  it('coerces non-string fields to strings', () => {
    const r = sanitizeLookup({
      word: 123 as unknown as string,
      context: undefined,
      title: null as unknown as string,
    });
    expect(r).toEqual({ word: '123', context: '', title: '' });
  });

  it('passes short, valid input through unchanged', () => {
    expect(sanitizeLookup({ word: 'Apple', context: 'pie', title: 'Recipe' })).toEqual({
      word: 'Apple',
      context: 'pie',
      title: 'Recipe',
    });
  });
});
