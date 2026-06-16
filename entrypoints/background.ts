// Background (Chrome: service worker / Firefox: event page). Owns the context
// menu and the on-device model. Browser-agnostic: all model differences live
// behind `provider`. Each overlay connects a port and runs a conversation over
// it; the popup/options connect a separate control port.

import { defineBackground, browser } from '#imports';
import { provider } from '../utils/ai';
import { buildUserPrompt } from '../utils/ai/prompt';
import { sanitizeLookup } from '../utils/sanitize';
import { runTurn } from '../utils/conversation';
import { serveControl } from '../utils/control-handler';
import { CONTROL_PORT } from '../utils/control';
import {
  PORT_NAME,
  type ConversationRequest,
  type PortMessage,
  type StartMessage,
} from '../utils/messages';
import type { Conversation } from '../utils/ai/types';

// WXT builds entrypoints/overlay.ts as an unlisted script -> /overlay.js. It is
// NOT a registered content script: no content_scripts entry, no host
// permissions, no scary install warning. We inject it on demand (ADR-002).
const OVERLAY_FILE = '/overlay.js';

const FOLLOWUP_MAX = 600;

export default defineBackground(() => {
  // Recreate on every wake — covers install, startup, and update in one path;
  // removeAll makes it idempotent.
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: 'whatsit',
      title: 'What’s this? — "%s"',
      contexts: ['selection'],
    });
  });

  // Pre-warm in parallel with the click's injection + selection capture.
  provider.prewarm?.();

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'whatsit' || !tab?.id) return;
    try {
      // Ask for any required permission while we still hold the click's user
      // gesture (Firefox's trialML needs it).
      if (provider.requestAccess) await provider.requestAccess();

      // activeTab grants us this tab only, because the user just invoked us on
      // it. The overlay guards against double-load, so re-injection is safe.
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: [OVERLAY_FILE],
      });
      const start: StartMessage = { type: 'whatsit:start' };
      await browser.tabs.sendMessage(tab.id, start);
    } catch (e) {
      // chrome:// pages, the stores, and PDFs refuse injection — nothing to do.
      console.error('Whatsit: cannot run on this page:', e);
    }
  });

  browser.runtime.onConnect.addListener((port) => {
    // The toolbar popup / options page model-manager channel.
    if (port.name === CONTROL_PORT) {
      serveControl(port, provider.manager);
      return;
    }

    // An overlay's conversation channel.
    if (port.name !== PORT_NAME) return;

    let conversation: Conversation | null = null;
    const post = (message: PortMessage) => {
      try {
        port.postMessage(message);
      } catch {
        // Port closed (overlay dismissed mid-stream) — stop quietly.
      }
    };

    const handle = async (msg: ConversationRequest) => {
      try {
        if (msg.type === 'lookup') {
          const request = sanitizeLookup(msg);
          if (!request) return;
          conversation = await provider.startConversation();
          await runTurn(conversation, buildUserPrompt(request), post);
        } else if (msg.type === 'ask') {
          const text = String(msg.text ?? '')
            .slice(0, FOLLOWUP_MAX)
            .trim();
          if (!text || !conversation) return;
          await runTurn(conversation, text, post);
        }
      } catch (e) {
        post({
          type: 'error',
          message: e instanceof Error ? e.message : 'Something went wrong.',
        });
      }
    };

    port.onMessage.addListener((msg) => {
      void handle(msg as ConversationRequest);
    });
    port.onDisconnect.addListener(() => {
      conversation?.dispose?.();
      conversation = null;
    });
  });
});
