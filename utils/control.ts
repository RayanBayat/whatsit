// Control channel between the toolbar popup / options page and the background.
// Separate from the lookup port (utils/messages.ts) — this manages the model.

import type { ManagedModel } from './ai/types';

export const CONTROL_PORT = 'whatsit-control';

export interface EngineState {
  engineLabel: string;
  canSelectModel: boolean;
  canDelete: boolean;
  models: ManagedModel[];
  activeModelId: string;
  downloaded: boolean;
  busy: boolean; // a download is currently running
  progress: number | null; // 0-100 while downloading, else null
}

export interface DiagnosticsData {
  engineLabel: string;
  activeModelId: string;
  downloaded: boolean;
  // Engine-specific label → value pairs (availability, params, model, dtype…).
  fields: Record<string, string>;
}

// popup -> background
export type ControlRequest =
  | { type: 'getState' }
  | { type: 'setModel'; id: string }
  | { type: 'download' }
  | { type: 'delete' }
  | { type: 'diagnostics' };

// background -> popup
export type ControlMessage =
  | { type: 'state'; state: EngineState }
  | { type: 'progress'; progress: number }
  | { type: 'done' }
  | { type: 'error'; message: string }
  | { type: 'diagnostics'; data: DiagnosticsData };
