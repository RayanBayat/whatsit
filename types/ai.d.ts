// Ambient types for the browsers' on-device AI APIs. Neither ships official
// @types, and both are non-standard/experimental, so we declare the slice we use.

// --- Chrome: Prompt API (Gemini Nano), exposed as a global `LanguageModel` ---
// https://developer.chrome.com/docs/ai/prompt-api

interface LanguageModelExpected {
  type: 'text';
  languages?: string[];
}

interface LanguageModelInitialPrompt {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LanguageModelMonitor {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: { loaded: number }) => void,
  ): void;
}

interface LanguageModelCreateOptions {
  expectedInputs?: LanguageModelExpected[];
  expectedOutputs?: LanguageModelExpected[];
  initialPrompts?: LanguageModelInitialPrompt[];
  // temperature and topK must be set together (or neither).
  temperature?: number;
  topK?: number;
  monitor?: (monitor: LanguageModelMonitor) => void;
  signal?: AbortSignal;
}

type LanguageModelAvailability =
  | 'unavailable'
  | 'downloadable'
  | 'downloading'
  | 'available';

interface LanguageModelSession {
  clone(): Promise<LanguageModelSession>;
  prompt(input: string): Promise<string>;
  promptStreaming(input: string): AsyncIterable<string>;
  destroy(): void;
}

interface LanguageModelParams {
  defaultTopK: number;
  maxTopK: number;
  defaultTemperature: number;
  maxTemperature: number;
}

interface LanguageModelFactory {
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
  availability(
    options?: LanguageModelCreateOptions,
  ): Promise<LanguageModelAvailability>;
  params(): Promise<LanguageModelParams>;
}

// May be absent (older Chrome, Firefox). Guard with `typeof LanguageModel`.
declare var LanguageModel: LanguageModelFactory | undefined;
