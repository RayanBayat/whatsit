// Options page: prompt-library editor + generation settings + on-device
// diagnostics.

import { browser } from '#imports';
import {
  getPrompts,
  savePrompts,
  getActivePromptId,
  setActivePromptId,
  type PromptDef,
} from '../../utils/prompts';
import {
  getSettings,
  setSettings,
  DEFAULT_SETTINGS,
  SETTING_BOUNDS,
  type GenerationSettings,
} from '../../utils/settings';
import { CONTROL_PORT, type ControlMessage } from '../../utils/control';

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

// ---------------- Prompt library ----------------

const promptsEl = byId('prompts');
const savedEl = byId('saved');
let working: PromptDef[] = [];
let activeId = '';

function newId(): string {
  return (
    (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
    `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
}

function renderPrompts() {
  promptsEl.replaceChildren(
    ...working.map((p) => {
      const card = document.createElement('div');
      card.className = 'card prompt';

      const head = document.createElement('div');
      head.className = 'prompt-head';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'active';
      radio.className = 'radio';
      radio.checked = p.id === activeId;
      radio.title = 'Use this prompt';
      radio.addEventListener('change', async () => {
        activeId = p.id;
        await setActivePromptId(activeId);
        renderPrompts();
      });

      const name = document.createElement('input');
      name.className = 'name';
      name.value = p.name;
      name.placeholder = 'Prompt name';
      name.addEventListener('input', () => {
        p.name = name.value;
      });

      head.append(radio, name);
      if (p.id === activeId) {
        const tag = document.createElement('span');
        tag.className = 'active-tag';
        tag.textContent = 'ACTIVE';
        head.appendChild(tag);
      }
      const del = document.createElement('button');
      del.className = 'danger';
      del.textContent = 'Delete';
      del.addEventListener('click', () => {
        working = working.filter((x) => x.id !== p.id);
        renderPrompts();
      });
      head.appendChild(del);

      const text = document.createElement('textarea');
      text.value = p.text;
      text.placeholder = 'System prompt…';
      text.addEventListener('input', () => {
        p.text = text.value;
      });

      card.append(head, text);
      return card;
    }),
  );
}

byId('add').addEventListener('click', () => {
  working.push({ id: newId(), name: 'New prompt', text: '' });
  renderPrompts();
});

byId('save').addEventListener('click', async () => {
  working = working.filter((p) => p.name.trim() || p.text.trim());
  await savePrompts(working);
  if (!working.some((p) => p.id === activeId) && working[0]) {
    activeId = working[0].id;
    await setActivePromptId(activeId);
  }
  renderPrompts();
  savedEl.classList.add('show');
  setTimeout(() => savedEl.classList.remove('show'), 1500);
});

async function loadPrompts() {
  [working, activeId] = await Promise.all([getPrompts(), getActivePromptId()]);
  working = working.map((p) => ({ ...p })); // editable copy
  renderPrompts();
}

// ---------------- Generation settings ----------------

const tempEl = byId<HTMLInputElement>('temp');
const topkEl = byId<HTMLInputElement>('topk');
const maxtokEl = byId<HTMLInputElement>('maxtok');
const tempValEl = byId('temp-val');
const topkValEl = byId('topk-val');
const maxtokValEl = byId('maxtok-val');

function configRange(
  el: HTMLInputElement,
  bounds: { min: number; max: number; step: number },
) {
  el.min = String(bounds.min);
  el.max = String(bounds.max);
  el.step = String(bounds.step);
}

function fillTrack(el: HTMLInputElement) {
  const min = +el.min;
  const max = +el.max;
  const pct = ((+el.value - min) / (max - min)) * 100;
  el.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--track) ${pct}%)`;
}

function reflectSettings(s: GenerationSettings) {
  tempEl.value = String(s.temperature);
  topkEl.value = String(s.topK);
  maxtokEl.value = String(s.maxTokens);
  updateLabels();
}

function updateLabels() {
  tempValEl.textContent = (+tempEl.value).toFixed(1);
  topkValEl.textContent = String(+topkEl.value);
  maxtokValEl.textContent = String(+maxtokEl.value);
  [tempEl, topkEl, maxtokEl].forEach(fillTrack);
}

function currentSettings(): GenerationSettings {
  return {
    temperature: +tempEl.value,
    topK: +topkEl.value,
    maxTokens: +maxtokEl.value,
  };
}

async function loadSettings() {
  configRange(tempEl, SETTING_BOUNDS.temperature);
  configRange(topkEl, SETTING_BOUNDS.topK);
  configRange(maxtokEl, SETTING_BOUNDS.maxTokens);
  reflectSettings(await getSettings());
  byId('maxtok-note').textContent = import.meta.env.FIREFOX
    ? ''
    : 'Chrome caps its own output, so this mainly affects Firefox.';
}

for (const el of [tempEl, topkEl, maxtokEl]) {
  el.addEventListener('input', updateLabels);
  el.addEventListener('change', () => void setSettings(currentSettings()));
}
byId('reset-gen').addEventListener('click', async () => {
  await setSettings(DEFAULT_SETTINGS);
  reflectSettings(DEFAULT_SETTINGS);
});

// ---------------- Diagnostics ----------------

function badgeClass(value: string): 'ok' | 'warn' | 'err' | null {
  const s = value.toLowerCase();
  if (
    s.includes('unavailable') ||
    s.includes('not available') ||
    s.includes('not supported') ||
    s === 'no' ||
    s.startsWith('no ')
  )
    return 'err';
  if (
    s.includes('downloadable') ||
    s.includes('downloading') ||
    s.includes('likely cpu') ||
    s.includes('no adapter')
  )
    return 'warn';
  if (s.startsWith('available') || s === 'yes' || s.includes('acceleration'))
    return 'ok';
  return null;
}

function renderKv(container: HTMLElement, entries: Record<string, string>) {
  container.replaceChildren(
    ...Object.entries(entries).map(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'kv';
      const key = document.createElement('span');
      key.className = 'k';
      key.textContent = k;
      const val = document.createElement('span');
      val.className = 'val';
      const cls = badgeClass(v);
      if (cls) {
        const badge = document.createElement('span');
        badge.className = `badge ${cls}`;
        badge.textContent = v;
        val.appendChild(badge);
      } else {
        val.textContent = v;
        if (/[\\/]|^[%~]|^chrome:|^about:/.test(v)) val.classList.add('mono');
      }
      row.append(key, val);
      return row;
    }),
  );
}

function loadEngineDiagnostics() {
  const port = browser.runtime.connect({ name: CONTROL_PORT });
  port.onMessage.addListener((raw: unknown) => {
    const msg = raw as ControlMessage;
    if (msg.type !== 'diagnostics') return;
    renderKv(byId('engine-kv'), {
      Engine: msg.data.engineLabel,
      'Active model': msg.data.activeModelId,
      Downloaded: msg.data.downloaded ? 'yes' : 'no',
      ...msg.data.fields,
    });
  });
  port.postMessage({ type: 'diagnostics' });
}

function osFamily(): 'windows' | 'mac' | 'linux' | 'other' {
  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  const p = (uaData?.platform || navigator.platform || '').toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac')) return 'mac';
  if (p.includes('linux')) return 'linux';
  return 'other';
}

function loadModelStorage() {
  const os = osFamily();
  const out: Record<string, string> = {};
  if (import.meta.env.FIREFOX) {
    out['Managed by'] = 'Firefox AI Runtime (cached in your profile)';
    out['Profile folder'] = {
      windows: '%APPDATA%\\Mozilla\\Firefox\\Profiles\\<profile>',
      mac: '~/Library/Application Support/Firefox/Profiles/<profile>',
      linux: '~/.mozilla/firefox/<profile>',
      other: 'your Firefox profile directory',
    }[os];
    out['Find it via'] = 'about:support → Profile Directory';
  } else {
    out['Managed by'] = 'Chrome Optimization Guide component';
    out['Under'] = {
      windows: '%LOCALAPPDATA%\\Google\\Chrome\\User Data',
      mac: '~/Library/Application Support/Google/Chrome',
      linux: '~/.config/google-chrome',
      other: 'your Chrome User Data directory',
    }[os];
    out['Exact path'] = 'chrome://on-device-internals';
  }
  out['Note'] = 'Extensions can’t read the real path; this is the documented location.';
  renderKv(byId('storage-kv'), out);
}

async function loadDeviceDiagnostics() {
  const out: Record<string, string> = {};
  out['Logical cores'] = String(navigator.hardwareConcurrency || 'unknown');
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  out['Device memory'] = mem ? `≥ ${mem} GB` : 'unknown';

  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) out['Storage quota'] = `${(est.quota / 1e9).toFixed(1)} GB`;
    if (typeof est?.usage === 'number')
      out['Storage used'] = `${(est.usage / 1e9).toFixed(2)} GB`;
  } catch {
    // storage estimate unavailable
  }

  // WebGPU surface varies by version; probe loosely.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const gpu = (navigator as any).gpu;
  if (gpu?.requestAdapter) {
    try {
      const adapter: any = await gpu.requestAdapter();
      if (adapter) {
        out['WebGPU'] = 'available (GPU acceleration possible)';
        const info: any =
          adapter.info ??
          (adapter.requestAdapterInfo
            ? await adapter.requestAdapterInfo()
            : undefined);
        if (info?.vendor) out['GPU vendor'] = info.vendor;
        if (info?.architecture) out['GPU architecture'] = info.architecture;
        if (info?.description) out['GPU'] = info.description;
        if ('isFallbackAdapter' in adapter)
          out['Fallback adapter'] = String(Boolean(adapter.isFallbackAdapter));
      } else {
        out['WebGPU'] = 'no adapter (likely CPU only)';
      }
    } catch {
      out['WebGPU'] = 'unavailable';
    }
  } else {
    out['WebGPU'] = 'not supported';
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  renderKv(byId('device-kv'), out);
}

loadPrompts();
loadSettings();
loadEngineDiagnostics();
loadDeviceDiagnostics();
loadModelStorage();
