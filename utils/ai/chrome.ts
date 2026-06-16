// Chrome provider: Chrome's built-in Prompt API (Gemini Nano), running in the
// background service worker.
//
// One warm base session per worker lifetime (keyed by the active system prompt);
// each conversation clones it, so turns within a chat share history but separate
// chats don't contaminate each other (ADR-001, ADR-003).

import { getActivePromptText } from '../prompts';
import { getSettings } from '../settings';
import type {
  AiProvider,
  Conversation,
  ManagedModel,
  ModelManager,
} from './types';

const LANG: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

let basePromise: Promise<LanguageModelSession> | null = null;
let baseKey: string | null = null; // active prompt + generation settings
// Download progress reaches whichever overlay is waiting (status string) and the
// popup's progress ring (percent). At most one turn at a time in practice.
let activeStatus: ((message: string) => void) | null = null;
let onPercent: ((percent: number) => void) | null = null;

let paramsPromise: Promise<LanguageModelParams | null> | null = null;
function getParams(): Promise<LanguageModelParams | null> {
  if (!paramsPromise) paramsPromise = LanguageModel!.params().catch(() => null);
  return paramsPromise;
}

// Warm session keyed by (active prompt + generation settings): reused while
// those are unchanged, recreated once when the user edits either. temperature
// and topK must be passed together and within the model's advertised range.
async function getBaseSession(): Promise<LanguageModelSession> {
  const [system, settings, params] = await Promise.all([
    getActivePromptText(),
    getSettings(),
    getParams(),
  ]);
  const temperature = params
    ? Math.min(settings.temperature, params.maxTemperature)
    : settings.temperature;
  const topK = params ? Math.min(settings.topK, params.maxTopK) : settings.topK;

  const key = `${system}::t${temperature}::k${topK}`;
  if (basePromise && baseKey === key) return basePromise;
  baseKey = key;
  basePromise = LanguageModel!
    .create({
      ...LANG,
      temperature,
      topK,
      initialPrompts: [{ role: 'system', content: system }],
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          // Only fires for a real download (first install) — not a warm load.
          const pct = Math.round(e.loaded * 100);
          activeStatus?.(`Downloading on-device model (one-time): ${pct}%`);
          onPercent?.(pct);
        });
      },
    })
    .catch((e) => {
      basePromise = null; // allow retry on next turn
      baseKey = null;
      throw e;
    });
  return basePromise;
}

// availability() can report "unavailable" on a perfectly capable device — the
// perf check may not have run, the model may not be downloaded, or a flag may
// be off. So we never pre-judge on it; we just try to create the session and,
// if that fails, report the real reason plus where to look.
function startupError(e: unknown): Error {
  const detail = e instanceof Error ? e.message : String(e);
  return new Error(
    'Chrome couldn’t start on-device AI (Gemini Nano). Check that the Prompt API ' +
      'is enabled and the model has finished downloading — see ' +
      `chrome://on-device-internals. (${detail})`,
  );
}

// Chrome manages Gemini Nano itself: one fixed model, no selecting or deleting.
const NANO: ManagedModel = {
  id: 'gemini-nano',
  label: 'Gemini Nano',
  size: 'managed by Chrome',
  detail: 'Built into Chrome; downloads automatically on first use.',
};

const chromeManager: ModelManager = {
  engineLabel: 'Chrome Prompt API · Gemini Nano',
  canSelectModel: false,
  canDelete: false,
  listModels: () => [NANO],
  getActiveModelId: async () => NANO.id,
  setActiveModelId: async () => {}, // single Chrome-managed model
  async isDownloaded() {
    if (typeof LanguageModel === 'undefined') return false;
    return (await LanguageModel.availability(LANG)) === 'available';
  },
  async download(onProgress) {
    if (typeof LanguageModel === 'undefined') {
      throw new Error(
        'On-device AI isn’t available. Whatsit needs Chrome 138+ with the Prompt API enabled.',
      );
    }
    onPercent = onProgress;
    try {
      await getBaseSession().catch((e) => {
        throw startupError(e);
      });
      onProgress(100);
    } finally {
      onPercent = null;
    }
  },
  async deleteCache() {
    throw new Error(
      'Chrome manages Gemini Nano; it can’t be deleted from the extension.',
    );
  },
  async describe() {
    const fields: Record<string, string> = {};
    if (typeof LanguageModel === 'undefined') {
      fields['Prompt API'] = 'not available (needs Chrome 138+)';
      return fields;
    }
    fields['Model availability'] = await LanguageModel.availability(LANG);
    try {
      const p = await LanguageModel.params();
      fields['Default temperature'] = String(p.defaultTemperature);
      fields['Max temperature'] = String(p.maxTemperature);
      fields['Default top-K'] = String(p.defaultTopK);
      fields['Max top-K'] = String(p.maxTopK);
    } catch {
      // params() unsupported on this build — skip.
    }
    return fields;
  },
};

export const chromeProvider: AiProvider = {
  // The worker wakes on the menu click, so this runs in parallel with script
  // injection and selection capture instead of after them.
  prewarm() {
    if (typeof LanguageModel === 'undefined') return;
    getBaseSession().catch(() => {});
  },

  async startConversation(): Promise<Conversation> {
    if (typeof LanguageModel === 'undefined') {
      throw new Error(
        'On-device AI isn’t available in this browser. Whatsit needs Chrome 138+ with the Prompt API enabled.',
      );
    }
    const base = await getBaseSession().catch((e) => {
      throw startupError(e);
    });

    let session: LanguageModelSession;
    let isClone = false;
    try {
      session = await base.clone(); // turns share history; chats stay isolated
      isClone = true;
    } catch {
      session = base; // clone unsupported — fall back to the shared session
    }

    return {
      async send(userMessage, events) {
        activeStatus = events.onStatus;
        try {
          const stream = session.promptStreaming(userMessage);
          for await (const chunk of stream) events.onChunk(chunk);
        } finally {
          activeStatus = null;
        }
      },
      dispose() {
        if (isClone) session.destroy(); // never destroy the shared base session
      },
    };
  },

  manager: chromeManager,
};
