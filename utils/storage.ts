// Thin wrappers over browser.storage.local for the model manager. The
// "downloaded" flag is a best-effort hint (the actual cache could be cleared
// by the browser); it just drives the popup's "Ready / Download" state.

import { browser } from '#imports';

const ACTIVE_MODEL_KEY = 'activeModelId';
const DOWNLOADED_KEY = 'downloadedModelIds';

export async function getActiveModelId(fallback: string): Promise<string> {
  const r = await browser.storage.local.get(ACTIVE_MODEL_KEY);
  const id = r[ACTIVE_MODEL_KEY];
  return typeof id === 'string' && id ? id : fallback;
}

export async function setActiveModelId(id: string): Promise<void> {
  await browser.storage.local.set({ [ACTIVE_MODEL_KEY]: id });
}

async function downloadedSet(): Promise<Set<string>> {
  const r = await browser.storage.local.get(DOWNLOADED_KEY);
  const list = r[DOWNLOADED_KEY];
  return new Set(Array.isArray(list) ? (list as string[]) : []);
}

export async function markDownloaded(id: string): Promise<void> {
  const set = await downloadedSet();
  set.add(id);
  await browser.storage.local.set({ [DOWNLOADED_KEY]: [...set] });
}

export async function isDownloaded(id: string): Promise<boolean> {
  return (await downloadedSet()).has(id);
}

export async function clearDownloaded(): Promise<void> {
  await browser.storage.local.set({ [DOWNLOADED_KEY]: [] });
}
