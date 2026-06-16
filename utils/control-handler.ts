// Serves the toolbar popup's control port: report engine state, switch model,
// download (streaming progress), delete. Delegates to the provider's manager,
// which is passed in (so this stays decoupled from the provider modules).

import type { ModelManager } from './ai/types';
import type { ControlMessage, ControlRequest, EngineState } from './control';

export interface ControlPort {
  postMessage(message: ControlMessage): void;
  onMessage: { addListener(callback: (message: ControlRequest) => void): void };
}

// Download state lives at module scope so a popup that closes and reopens
// mid-download still sees the current progress.
let busy = false;
let progress = 0;

export function serveControl(
  port: ControlPort,
  manager: ModelManager | undefined,
): void {
  const post = (message: ControlMessage) => {
    try {
      port.postMessage(message);
    } catch {
      // Popup closed — ignore.
    }
  };

  if (!manager) {
    post({ type: 'error', message: 'Model management is unavailable here.' });
    return;
  }

  const sendState = async () => {
    const [activeModelId, downloaded] = await Promise.all([
      manager.getActiveModelId(),
      manager.isDownloaded(),
    ]);
    const state: EngineState = {
      engineLabel: manager.engineLabel,
      canSelectModel: manager.canSelectModel,
      canDelete: manager.canDelete,
      models: manager.listModels(),
      activeModelId,
      downloaded,
      busy,
      progress: busy ? progress : null,
    };
    post({ type: 'state', state });
  };

  const sendDiagnostics = async () => {
    const [activeModelId, downloaded, fields] = await Promise.all([
      manager.getActiveModelId(),
      manager.isDownloaded(),
      manager.describe ? manager.describe() : Promise.resolve({}),
    ]);
    post({
      type: 'diagnostics',
      data: { engineLabel: manager.engineLabel, activeModelId, downloaded, fields },
    });
  };

  const handle = async (msg: ControlRequest) => {
    try {
      if (msg.type === 'getState') {
        await sendState();
      } else if (msg.type === 'diagnostics') {
        await sendDiagnostics();
      } else if (msg.type === 'setModel') {
        await manager.setActiveModelId(msg.id);
        await sendState();
      } else if (msg.type === 'delete') {
        await manager.deleteCache();
        await sendState();
      } else if (msg.type === 'download') {
        if (busy) return;
        busy = true;
        progress = 0;
        await sendState();
        try {
          await manager.download((pct) => {
            progress = pct;
            post({ type: 'progress', progress: pct });
          });
          busy = false;
          progress = 100;
          post({ type: 'done' });
        } catch (e) {
          busy = false;
          post({
            type: 'error',
            message: e instanceof Error ? e.message : 'Download failed.',
          });
        }
        await sendState();
      }
    } catch (e) {
      post({
        type: 'error',
        message: e instanceof Error ? e.message : 'Something went wrong.',
      });
      await sendState();
    }
  };

  port.onMessage.addListener((msg) => {
    void handle(msg);
  });
}
