import { describe, it, expect, beforeEach } from 'vitest';
import { surroundingText, pageIsDark } from '../utils/page';

function selectContents(el: Element): Selection {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  return sel;
}

describe('surroundingText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the enclosing block text for short paragraphs', () => {
    document.body.innerHTML =
      '<p id="p">He bowled a strike in the final frame of the match.</p>';
    const sel = selectContents(document.getElementById('p')!);
    expect(surroundingText(sel, 'strike')).toBe(
      'He bowled a strike in the final frame of the match.',
    );
  });

  it('walks up from an inline element to the block ancestor', () => {
    document.body.innerHTML =
      '<p id="p">He bowled a <span id="s">strike</span> in the final frame of the match.</p>';
    const sel = selectContents(document.getElementById('s')!);
    expect(surroundingText(sel, 'strike')).toContain(
      'He bowled a strike in the final frame',
    );
  });

  it('clamps long text to <= 600 chars, kept centered on the word', () => {
    const filler = 'lorem ipsum dolor '.repeat(60); // ~1080 chars each side
    document.body.innerHTML = `<p id="p">${filler}NEEDLE ${filler}</p>`;
    const sel = selectContents(document.getElementById('p')!);
    const out = surroundingText(sel, 'NEEDLE');
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out).toContain('NEEDLE');
  });

  it('collapses runs of whitespace', () => {
    document.body.innerHTML =
      '<p id="p">alpha     beta\n\n\ngamma delta epsilon zeta eta theta</p>';
    const sel = selectContents(document.getElementById('p')!);
    expect(surroundingText(sel, 'alpha')).toBe(
      'alpha beta gamma delta epsilon zeta eta theta',
    );
  });
});

describe('pageIsDark', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
  });

  it('is true for a dark background', () => {
    const el = document.createElement('div');
    el.style.backgroundColor = 'rgb(20, 20, 20)';
    document.body.appendChild(el);
    expect(pageIsDark(el)).toBe(true);
  });

  it('is false for a light background', () => {
    const el = document.createElement('div');
    el.style.backgroundColor = 'rgb(255, 255, 255)';
    document.body.appendChild(el);
    expect(pageIsDark(el)).toBe(false);
  });

  it('inherits a dark ancestor through a transparent child', () => {
    document.body.style.backgroundColor = 'rgb(10, 10, 10)';
    const child = document.createElement('div'); // no background of its own
    document.body.appendChild(child);
    expect(pageIsDark(child)).toBe(true);
  });

  it('defaults to light when nothing has an opaque background', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(pageIsDark(el)).toBe(false);
  });
});
