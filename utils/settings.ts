// Generation settings the user can tweak in the options page. Applied by both
// providers: Chrome uses temperature + topK at session create (clamped to the
// model's params()); Firefox passes temperature / top_k / max_new_tokens to
// runEngine. `maxTokens` has no Chrome equivalent (the Prompt API caps output
// itself), so it only affects Firefox.

import { browser } from '#imports';

export interface GenerationSettings {
  temperature: number;
  topK: number;
  maxTokens: number;
}

export const DEFAULT_SETTINGS: GenerationSettings = {
  temperature: 0.7,
  topK: 3,
  maxTokens: 80,
};

export const SETTING_BOUNDS = {
  temperature: { min: 0, max: 2, step: 0.1 },
  topK: { min: 1, max: 40, step: 1 },
  maxTokens: { min: 20, max: 300, step: 10 },
} as const;

const KEY = 'genSettings';

function clampOne(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function clampSettings(s: GenerationSettings): GenerationSettings {
  return {
    temperature: clampOne(
      s.temperature,
      SETTING_BOUNDS.temperature.min,
      SETTING_BOUNDS.temperature.max,
    ),
    topK: Math.round(
      clampOne(s.topK, SETTING_BOUNDS.topK.min, SETTING_BOUNDS.topK.max),
    ),
    maxTokens: Math.round(
      clampOne(
        s.maxTokens,
        SETTING_BOUNDS.maxTokens.min,
        SETTING_BOUNDS.maxTokens.max,
      ),
    ),
  };
}

export async function getSettings(): Promise<GenerationSettings> {
  const r = await browser.storage.local.get(KEY);
  const stored = r[KEY] as Partial<GenerationSettings> | undefined;
  return clampSettings({ ...DEFAULT_SETTINGS, ...(stored ?? {}) });
}

export async function setSettings(s: GenerationSettings): Promise<void> {
  await browser.storage.local.set({ [KEY]: clampSettings(s) });
}
