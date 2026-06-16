// Trust boundary: everything arriving over the port from a page is untrusted.
// Cap each field so a page-sized selection can't build an unbounded prompt,
// and coerce non-strings. Returns null when there's no usable word.

import type { LookupRequest } from './ai/types';

export const LIMITS = { word: 200, context: 700, title: 120 } as const;

export function sanitizeLookup(
  msg: { word?: unknown; context?: unknown; title?: unknown } | null | undefined,
): LookupRequest | null {
  const word = String(msg?.word ?? '').slice(0, LIMITS.word);
  const context = String(msg?.context ?? '').slice(0, LIMITS.context);
  const title = String(msg?.title ?? '').slice(0, LIMITS.title);
  if (!word) return null;
  return { word, context, title };
}
