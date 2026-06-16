// Shared prompt. Both providers want the same behavior; only the plumbing for
// "system instruction" differs (Chrome takes a system role; Firefox passes it
// as the first chat message).
//
// The job is narrow on purpose: explain the SELECTED text, in the sense the
// context implies — NOT summarize the page. (An earlier, looser prompt made
// small models describe the surrounding topic instead of the word.)

export const SYSTEM_PROMPT =
  'A reader selected a word or phrase on a web page and wants to know what it ' +
  'means. Explain the SELECTED text itself, in the sense that fits the ' +
  'surrounding context. Reply with one or two plain sentences a general reader ' +
  'understands: define common words simply; identify names, places, and jargon ' +
  'specifically. Do NOT summarize the surrounding text or drift to its topic. ' +
  'Plain text only, no markdown. Max 40 words.';

export function buildUserPrompt(request: {
  word: string;
  context: string;
  title: string;
}): string {
  return (
    `Selected text: "${request.word}"\n\n` +
    'Surrounding context (use only to choose the right meaning, do not ' +
    `describe it): "${request.context}"`
  );
}
