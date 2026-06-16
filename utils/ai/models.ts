import type { ManagedModel } from './types';

// Firefox-selectable models. Two hard constraints (ADR-005):
//   1. Org must be Mozilla or Xenova (Firefox refuses any other).
//   2. `dtype` must map to an ONNX file that actually exists in the repo —
//      q8 -> onnx/model_quantized.onnx, q4 -> onnx/model_q4.onnx, etc.
//      (Both files below were verified to exist before adding the entry.)
export interface FirefoxModelDef extends ManagedModel {
  dtype: 'q8' | 'q4' | 'fp16' | 'int8' | 'q4f16';
}

export const FIREFOX_MODELS: FirefoxModelDef[] = [
  {
    id: 'Xenova/Qwen1.5-0.5B-Chat',
    label: 'Qwen1.5 0.5B Chat',
    size: '~0.4 GB',
    detail: 'Smallest & fastest · onnx/model_q4.onnx',
    dtype: 'q4',
  },
  {
    id: 'Xenova/TinyLlama-1.1B-Chat-v1.0',
    label: 'TinyLlama 1.1B Chat',
    size: '~0.7 GB',
    detail: 'Larger, may answer better · onnx/model_quantized.onnx',
    dtype: 'q8',
  },
];

export const DEFAULT_FIREFOX_MODEL_ID = FIREFOX_MODELS[0]!.id;

export function findFirefoxModel(id: string): FirefoxModelDef {
  return FIREFOX_MODELS.find((m) => m.id === id) ?? FIREFOX_MODELS[0]!;
}
