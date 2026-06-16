import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  DEFAULT_SETTINGS,
  SETTING_BOUNDS,
  clampSettings,
  getSettings,
  setSettings,
} from '../utils/settings';

describe('generation settings', () => {
  beforeEach(() => fakeBrowser.reset());

  it('returns defaults when storage is empty', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges stored values over defaults', async () => {
    await setSettings({ ...DEFAULT_SETTINGS, temperature: 1.2 });
    const s = await getSettings();
    expect(s.temperature).toBe(1.2);
    expect(s.topK).toBe(DEFAULT_SETTINGS.topK);
  });

  it('clamps out-of-range values to the bounds', () => {
    const c = clampSettings({ temperature: 99, topK: 0, maxTokens: 9999 });
    expect(c.temperature).toBe(SETTING_BOUNDS.temperature.max);
    expect(c.topK).toBe(SETTING_BOUNDS.topK.min);
    expect(c.maxTokens).toBe(SETTING_BOUNDS.maxTokens.max);
  });

  it('rounds topK and maxTokens to integers', () => {
    const c = clampSettings({ temperature: 0.55, topK: 3.7, maxTokens: 85.4 });
    expect(Number.isInteger(c.topK)).toBe(true);
    expect(Number.isInteger(c.maxTokens)).toBe(true);
  });
});
