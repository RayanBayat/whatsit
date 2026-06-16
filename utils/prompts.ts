// The prompt library: the system instruction that steers the explanation.
// Users manage these in the options page and pick the active one in the popup;
// the providers read the active prompt's text at lookup time.

import { browser } from '#imports';
import { SYSTEM_PROMPT } from './ai/prompt';

export interface PromptDef {
  id: string;
  name: string;
  text: string;
}

// Seeded on first run; fully editable afterwards.
export const BUILTIN_PROMPTS: PromptDef[] = [
  { id: 'default', name: 'In context (default)', text: SYSTEM_PROMPT },
  {
    id: 'simple',
    name: 'Simple definition',
    text:
      'Define the selected word or phrase in one plain sentence a general ' +
      'reader understands, in the sense that fits the context. No extra facts. ' +
      'Plain text only, no markdown. Max 25 words.',
  },
  {
    id: 'eli5',
    name: "Explain like I'm 5",
    text:
      'Explain the selected text in very simple, friendly terms, as if to a ' +
      'curious child. One or two short sentences. Plain text only, no markdown.',
  },
  {
    id: 'technical',
    name: 'Technical',
    text:
      'Explain the selected term precisely for a technical reader, naming the ' +
      'specific sense used in the surrounding context. Plain text only, no ' +
      'markdown. Max 40 words.',
  },
];

const PROMPTS_KEY = 'prompts';
const ACTIVE_KEY = 'activePromptId';

export async function getPrompts(): Promise<PromptDef[]> {
  const r = await browser.storage.local.get(PROMPTS_KEY);
  const list = r[PROMPTS_KEY];
  return Array.isArray(list) && list.length
    ? (list as PromptDef[])
    : BUILTIN_PROMPTS;
}

export async function savePrompts(prompts: PromptDef[]): Promise<void> {
  await browser.storage.local.set({ [PROMPTS_KEY]: prompts });
}

export async function getActivePromptId(): Promise<string> {
  const r = await browser.storage.local.get(ACTIVE_KEY);
  const id = r[ACTIVE_KEY];
  return typeof id === 'string' && id ? id : BUILTIN_PROMPTS[0]!.id;
}

export async function setActivePromptId(id: string): Promise<void> {
  await browser.storage.local.set({ [ACTIVE_KEY]: id });
}

export async function getActivePromptText(): Promise<string> {
  const [prompts, activeId] = await Promise.all([
    getPrompts(),
    getActivePromptId(),
  ]);
  const found = prompts.find((p) => p.id === activeId) ?? prompts[0];
  return found?.text || SYSTEM_PROMPT;
}
