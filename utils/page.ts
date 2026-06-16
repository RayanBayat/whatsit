// Pure DOM reads used by the overlay, extracted so they're unit-testable in
// jsdom without injecting the whole content script.

const MAX_CONTEXT = 600;

const BLOCKS = new Set([
  'P', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'ARTICLE', 'SECTION', 'DIV',
  'MAIN', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'PRE', 'FIGCAPTION',
]);

// Walk up from the selection to a block element with enough text, then clamp to
// ~600 chars centered on the selected word.
export function surroundingText(sel: Selection, word: string): string {
  let node: Node | null = sel.getRangeAt(0).commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  let block = node as HTMLElement | null;
  while (
    block &&
    block !== document.body &&
    !(BLOCKS.has(block.tagName) && (block.innerText || '').length > 40)
  ) {
    block = block.parentElement;
  }
  let text = ((block || document.body).innerText || '').replace(/\s+/g, ' ');
  if (text.length > MAX_CONTEXT) {
    const idx = text.indexOf(word);
    const center = idx >= 0 ? idx + word.length / 2 : text.length / 2;
    const begin = Math.max(0, Math.floor(center - MAX_CONTEXT / 2));
    text = text.slice(begin, begin + MAX_CONTEXT);
  }
  return text.trim();
}

// The card should feel native to the page it sits on: light card on light
// pages, dark on dark. Walk up from `start` to the first non-transparent
// background and judge its luminance. OS theme is irrelevant here.
export function pageIsDark(start: HTMLElement | null = document.body): boolean {
  let el: HTMLElement | null = start;
  while (el) {
    const bg = getComputedStyle(el).backgroundColor;
    const m = bg?.match(
      /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/,
    );
    if (m && (m[4] === undefined || parseFloat(m[4]) > 0.1)) {
      return (
        0.2126 * parseFloat(m[1]!) +
          0.7152 * parseFloat(m[2]!) +
          0.0722 * parseFloat(m[3]!) <
        128
      );
    }
    el = el.parentElement;
  }
  return false; // all transparent — pages default to white
}
