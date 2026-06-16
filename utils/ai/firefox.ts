// Firefox provider: the WebExtensions ML API (browser.trial.ml), backed by the
// Firefox AI Runtime. Firefox has no Prompt API, so this is the on-device path.
//
// EXPERIMENTAL (see ADR-005, the "Firefox gate"):
//   1. The active model (utils/ai/models.ts) must be hosted under the *Mozilla*
//      or *Xenova* Hugging Face orgs, and good enough to disambiguate by context.
//   2. runEngine is blocking (no token stream), so we hold the chat history
//      ourselves and re-run it per turn, then fake a stream into the card.
//
// API: https://firefox-source-docs.mozilla.org/toolkit/components/ml/extensions.html

import { browser } from '#imports';
import { getActivePromptText } from '../prompts';
import { getSettings } from '../settings';
import {
  FIREFOX_MODELS,
  DEFAULT_FIREFOX_MODEL_ID,
  findFirefoxModel,
} from './models';
import {
  getActiveModelId,
  setActiveModelId,
  isDownloaded,
  markDownloaded,
  clearDownloaded,
} from '../storage';
import type {
  AiProvider,
  Conversation,
  ManagedModel,
  ModelManager,
} from './types';

// --- browser.trial.ml typing (no official types for an experimental API) ---
interface MlEngineOptions {
  taskName: string;
  modelId?: string;
  modelHub?: 'huggingface' | 'mozilla';
  backend?: 'onnx' | 'wllama';
  // dtype selects the ONNX file: q8 -> model_quantized.onnx (runtime default),
  // q4 -> model_q4.onnx, fp16 -> model_fp16.onnx, fp32 -> model.onnx, ...
  dtype?: 'fp32' | 'fp16' | 'q8' | 'int8' | 'uint8' | 'q4' | 'q4f16' | 'bnb4';
  modelFile?: string;
  numContext?: number;
}
interface MlRunRequest {
  args: unknown[];
  options?: Record<string, unknown>;
}
interface MlProgressData {
  progress?: number;
  [key: string]: unknown;
}
interface TrialMl {
  createEngine(options: MlEngineOptions): Promise<void>;
  runEngine(request: MlRunRequest): Promise<unknown>;
  deleteCachedModels(): Promise<void>;
  onProgress: {
    addListener(listener: (data: MlProgressData) => void): void;
    removeListener(listener: (data: MlProgressData) => void): void;
  };
}

function ml(): TrialMl {
  const api = (browser as unknown as { trial?: { ml?: TrialMl } }).trial?.ml;
  if (!api) {
    throw new Error(
      'Firefox on-device AI is unavailable. Whatsit needs Firefox 142+ with the ML runtime enabled.',
    );
  }
  return api;
}

// trialML is an experimental optional permission the polyfill types don't know.
const ML_PERMISSION = { permissions: ['trialML'] } as unknown as Parameters<
  typeof browser.permissions.contains
>[0];

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// The engine is cached per active model; changing the model resets it. Download
// progress fans out two ways: a status string for the card, and a 0-100 percent
// for the popup's progress ring.
let enginePromise: Promise<void> | null = null;
let engineModelId: string | null = null;
let onStatus: ((message: string) => void) | null = null;
let onPercent: ((percent: number) => void) | null = null;
let progressBound = false;

function bindProgress(): void {
  if (progressBound) return;
  ml().onProgress.addListener((data) => {
    if (typeof data?.progress !== 'number') return;
    const pct = Math.round(data.progress);
    if (pct < 100) {
      onStatus?.(`Downloading on-device model (one-time): ${pct}%`);
    }
    onPercent?.(pct);
  });
  progressBound = true;
}

async function ensureEngine(): Promise<void> {
  const model = findFirefoxModel(await getActiveModelId(DEFAULT_FIREFOX_MODEL_ID));
  if (enginePromise && engineModelId === model.id) return enginePromise;
  bindProgress();
  engineModelId = model.id;
  enginePromise = ml()
    .createEngine({
      taskName: 'text-generation',
      modelHub: 'huggingface',
      modelId: model.id,
      dtype: model.dtype,
    })
    .then(() => markDownloaded(model.id))
    .catch((e: unknown) => {
      enginePromise = null; // allow retry on next turn
      engineModelId = null;
      throw e;
    });
  return enginePromise;
}

async function ensurePermission(): Promise<void> {
  if (await browser.permissions.contains(ML_PERMISSION)) return;
  throw new Error(
    'Whatsit needs permission to use Firefox’s on-device AI. ' +
      'Open the Whatsit toolbar popup and click Download (then Allow).',
  );
}

const firefoxManager: ModelManager = {
  engineLabel: 'Firefox AI Runtime · on-device',
  canSelectModel: true,
  canDelete: true,
  listModels(): ManagedModel[] {
    return FIREFOX_MODELS.map(({ id, label, size, detail }) => ({
      id,
      label,
      size,
      detail,
    }));
  },
  getActiveModelId: () => getActiveModelId(DEFAULT_FIREFOX_MODEL_ID),
  async setActiveModelId(id) {
    await setActiveModelId(id);
    enginePromise = null; // next download/turn uses the new model
    engineModelId = null;
  },
  isDownloaded: async () =>
    isDownloaded(await getActiveModelId(DEFAULT_FIREFOX_MODEL_ID)),
  async download(onProgress) {
    await ensurePermission();
    onPercent = onProgress;
    try {
      await ensureEngine();
      onProgress(100);
    } finally {
      onPercent = null;
    }
  },
  async deleteCache() {
    await ml().deleteCachedModels();
    await clearDownloaded();
    enginePromise = null;
    engineModelId = null;
  },
  async describe() {
    const model = findFirefoxModel(await getActiveModelId(DEFAULT_FIREFOX_MODEL_ID));
    const hasMl = Boolean(
      (browser as unknown as { trial?: { ml?: unknown } }).trial?.ml,
    );
    return {
      Runtime: 'Firefox AI Runtime (Transformers.js / ONNX)',
      'ML API': hasMl ? 'available' : 'unavailable (enable in about:config)',
      Model: model.id,
      Quantization: model.dtype,
    };
  },
};

export const firefoxProvider: AiProvider = {
  // trialML needs a user gesture; the context-menu click is one, so the
  // background calls this from the click handler before the first turn.
  async requestAccess() {
    try {
      if (await browser.permissions.contains(ML_PERMISSION)) return true;
      return await browser.permissions.request(ML_PERMISSION);
    } catch {
      return false;
    }
  },

  async startConversation(): Promise<Conversation> {
    await ensurePermission();
    const system = await getActivePromptText();
    // We keep the history and re-send it each turn (runEngine is stateless).
    const messages: ChatMessage[] = [{ role: 'system', content: system }];

    return {
      async send(userMessage, events) {
        onStatus = events.onStatus;
        try {
          await ensureEngine();
          messages.push({ role: 'user', content: userMessage });
          // Pass chat messages, NOT a concatenated string: this makes
          // Transformers.js apply the model's chat template. Without it, chat
          // models (e.g. Qwen) produce incoherent, often multilingual gibberish.
          const settings = await getSettings();
          const raw = await ml().runEngine({
            args: [messages],
            options: {
              max_new_tokens: settings.maxTokens,
              temperature: settings.temperature,
              top_k: settings.topK,
              do_sample: settings.temperature > 0,
            },
          });
          const text = parseGeneration(raw, userMessage);
          if (!text) throw new Error('The on-device model returned no text.');
          messages.push({ role: 'assistant', content: text });
          await streamOut(text, events.onChunk);
        } finally {
          onStatus = null;
        }
      },
    };
  },

  manager: firefoxManager,
};

// runEngine is blocking (no token stream), so fake one: emit the answer word by
// word so the card fills in progressively instead of popping in all at once.
async function streamOut(
  text: string,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const parts = text.match(/\S+\s*/g);
  if (!parts) {
    onChunk(text);
    return;
  }
  for (const part of parts) {
    onChunk(part);
    await new Promise((resolve) => setTimeout(resolve, 18));
  }
}

// Transformers.js text-generation returns [{ generated_text }] (and the prompt
// is usually echoed back). Be liberal about the shape; strip the prompt.
// Exported for unit tests — it's the trickiest, most model-dependent logic here.
export function parseGeneration(raw: unknown, prompt: string): string {
  const record = Array.isArray(raw)
    ? (raw[0] as Record<string, unknown> | undefined)
    : raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : undefined;

  // Chat-templated text-generation returns generated_text as the full message
  // list; the answer is the last assistant turn.
  const gen = record?.generated_text;
  if (Array.isArray(gen)) {
    const msgs = gen as Array<{ role?: string; content?: string }>;
    const assistant = [...msgs].reverse().find((m) => m?.role === 'assistant');
    const last = assistant ?? msgs[msgs.length - 1];
    return String(last?.content ?? '').trim();
  }

  // Otherwise a plain string completion (which may echo the prompt back).
  let out = '';
  if (typeof raw === 'string') {
    out = raw;
  } else if (record) {
    out = String(
      record.generated_text ??
        record.summary_text ??
        record.translation_text ??
        record.text ??
        '',
    );
  }

  if (out.startsWith(prompt)) out = out.slice(prompt.length);
  const marker = 'Explanation:';
  const markerAt = out.lastIndexOf(marker);
  if (markerAt >= 0) out = out.slice(markerAt + marker.length);
  return out.trim();
}
