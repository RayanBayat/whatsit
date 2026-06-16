// Overlay (unlisted script, injected on demand by the background). On
// "whatsit:start" it captures the selection + surrounding paragraph, shows a
// shadow-DOM card near the selection, and runs a conversation: the first answer
// explains the selection, then the user can ask follow-ups in a thread.
//
// Browser-agnostic: nothing here knows whether the answer comes from Gemini
// Nano or the Firefox AI runtime — it just renders chunks off the port.

import { browser, defineUnlistedScript } from '#imports';
import { pageIsDark, surroundingText } from '../utils/page';
import {
  PORT_NAME,
  type ConversationRequest,
  type PortMessage,
} from '../utils/messages';

interface OverlayUI {
  startAiTurn(): void;
  stream(text: string): void;
  status(message: string): void;
  finalize(text: string): void;
  error(message: string): void;
  addUserTurn(text: string): void;
  setBusy(busy: boolean): void;
  onAsk(handler: (text: string) => void): void;
  focusInput(): void;
}

export default defineUnlistedScript(() => {
  const w = window as unknown as { __whatsitLoaded?: boolean };
  if (w.__whatsitLoaded) return; // injected on every menu click — wire up once
  w.__whatsitLoaded = true;
  main();
});

function main() {
  let host: HTMLElement | null = null;

  browser.runtime.onMessage.addListener((msg: unknown) => {
    if ((msg as { type?: string })?.type === 'whatsit:start') start();
  });

  function start() {
    const sel = window.getSelection();
    const word = sel?.toString().trim().slice(0, 200);
    if (!sel || !word || !sel.rangeCount) return;

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const context = surroundingText(sel, word);
    const ui = showOverlay(word, rect);

    const port = browser.runtime.connect({ name: PORT_NAME });
    const sendReq = (req: ConversationRequest) => port.postMessage(req);

    let turnText = '';
    let gotChunk = false;

    port.onMessage.addListener((raw: unknown) => {
      const m = raw as PortMessage;
      if (m.type === 'chunk') {
        gotChunk = true;
        turnText += m.text;
        ui.stream(turnText);
      } else if (m.type === 'status') {
        ui.status(m.message);
      } else if (m.type === 'done') {
        ui.finalize(turnText);
        ui.setBusy(false);
        ui.focusInput();
      } else if (m.type === 'error') {
        ui.error(m.message);
        ui.setBusy(false);
      }
    });
    port.onDisconnect.addListener(() => {
      if (!gotChunk) ui.error('Lost connection to the model. Try again.');
      ui.setBusy(false);
    });

    function beginTurn() {
      turnText = '';
      gotChunk = false;
      ui.startAiTurn();
      ui.setBusy(true);
    }

    // First turn: explain the selection.
    beginTurn();
    sendReq({ word, context, title: document.title.slice(0, 120), type: 'lookup' });

    // Follow-ups: continue the same conversation.
    ui.onAsk((text) => {
      ui.addUserTurn(text);
      beginTurn();
      sendReq({ type: 'ask', text });
    });

    host?.addEventListener('whatsit:closed', () => port.disconnect(), {
      once: true,
    });
  }

  function showOverlay(word: string, rect: DOMRect): OverlayUI {
    closeOverlay();
    host = document.createElement('div');
    host.style.cssText = 'all: initial; position: absolute; z-index: 2147483647;';

    const margin = 8;
    const width = Math.min(400, document.documentElement.clientWidth - 2 * margin);
    host.style.left =
      Math.min(
        Math.max(margin, rect.left + window.scrollX),
        window.scrollX + document.documentElement.clientWidth - width - margin,
      ) + 'px';
    host.style.top = rect.bottom + window.scrollY + margin + 'px';

    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = template(width, word);

    const card = shadow.querySelector('.card') as HTMLElement;
    if (pageIsDark()) card.classList.add('dark');
    const thread = shadow.querySelector('.thread') as HTMLElement;
    const input = shadow.querySelector('.ask') as HTMLInputElement;
    const sendBtn = shadow.querySelector('.send') as HTMLButtonElement;
    shadow.querySelector('.close')!.addEventListener('click', () => closeOverlay());

    document.documentElement.appendChild(host);
    flipIfNeeded(rect, margin);

    setTimeout(() => {
      document.addEventListener('mousedown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);

    let current: HTMLElement | null = null; // the assistant bubble being filled

    const scrollDown = () => {
      thread.scrollTop = thread.scrollHeight;
    };

    let askHandler: ((text: string) => void) | null = null;
    const submit = () => {
      const text = input.value.trim();
      if (!text || input.disabled) return;
      input.value = '';
      askHandler?.(text);
    };
    sendBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    return {
      startAiTurn() {
        const ai = document.createElement('div');
        ai.className = 'msg ai';
        ai.innerHTML =
          '<span class="loading" aria-label="Thinking"><i></i><i></i><i></i></span>';
        thread.appendChild(ai);
        current = ai;
        scrollDown();
      },
      stream(text) {
        if (!current) return;
        current.textContent = text;
        const caret = document.createElement('span');
        caret.className = 'caret';
        current.appendChild(caret);
        scrollDown();
      },
      status(message) {
        if (!current) return;
        current.innerHTML = '';
        const s = document.createElement('span');
        s.className = 'status';
        s.textContent = message;
        current.appendChild(s);
        scrollDown();
      },
      finalize(text) {
        if (!current) return;
        current.textContent = text;
        scrollDown();
      },
      error(message) {
        if (!current) this.startAiTurn();
        current!.textContent = '';
        const e = document.createElement('span');
        e.className = 'err';
        e.textContent = message;
        current!.appendChild(e);
        scrollDown();
      },
      addUserTurn(text) {
        const you = document.createElement('div');
        you.className = 'msg you';
        you.textContent = text;
        thread.appendChild(you);
        scrollDown();
      },
      setBusy(busy) {
        input.disabled = busy;
        sendBtn.disabled = busy;
      },
      onAsk(handler) {
        askHandler = handler;
      },
      focusInput() {
        input.focus();
      },
    };
  }

  function flipIfNeeded(rect: DOMRect, margin: number) {
    if (!host) return;
    const cardH = host.offsetHeight;
    if (
      rect.bottom + margin + cardH > document.documentElement.clientHeight &&
      rect.top > cardH + 2 * margin
    ) {
      host.style.top = rect.top + window.scrollY - margin + 'px';
      host.style.transform = 'translateY(-100%)';
    }
  }

  function onOutside(e: MouseEvent) {
    if (host && !e.composedPath().includes(host)) closeOverlay();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closeOverlay();
  }
  function closeOverlay() {
    if (!host) return;
    host.dispatchEvent(new Event('whatsit:closed'));
    host.remove();
    host = null;
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  }
}

const CLOSE_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const SEND_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5M6 11l6-6 6 6"/></svg>';

function template(width: number, word: string): string {
  return `
    <style>
      .card {
        --bg: #ffffff; --text: #11181c; --muted: #5b6570;
        --border: rgba(2,6,23,0.09); --hairline: rgba(2,6,23,0.07);
        --hover: rgba(2,6,23,0.05);
        --accent: #3b6fb0; --accent-2: #6d5bd0; --accent-weak: rgba(59,111,176,0.10);
        --user-bg: rgba(59,111,176,0.12); --ring: rgba(59,111,176,0.26);
        --err: #c0392b;
        box-shadow: 0 2px 6px rgba(2,6,23,0.06), 0 18px 48px rgba(2,6,23,0.18);
      }
      .card.dark {
        --bg: #1f2024; --text: #eef0f3; --muted: #9aa1ad;
        --border: rgba(255,255,255,0.10); --hairline: rgba(255,255,255,0.08);
        --hover: rgba(255,255,255,0.07);
        --accent: #7aa7e6; --accent-2: #a78bfa; --accent-weak: rgba(122,167,230,0.16);
        --user-bg: rgba(122,167,230,0.18); --ring: rgba(122,167,230,0.34);
        --err: #ff8a7a;
        box-shadow: 0 2px 6px rgba(0,0,0,0.5), 0 18px 48px rgba(0,0,0,0.6);
      }
      .card {
        width: ${width}px; box-sizing: border-box; background: var(--bg);
        color: var(--text); border: 1px solid var(--border); border-radius: 14px;
        overflow: hidden; -webkit-font-smoothing: antialiased;
        font: 13.5px/1.6 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
        animation: enter .16s cubic-bezier(.2,.7,.3,1);
      }
      @keyframes enter { from { opacity: 0; transform: translateY(6px) scale(.98); } }
      .head {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 12px; border-bottom: 1px solid var(--hairline);
      }
      .logo {
        width: 18px; height: 18px; border-radius: 6px; flex: none;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18);
      }
      .brandname { font-weight: 650; font-size: 12.5px; letter-spacing: -.01em; }
      .sep { width: 3px; height: 3px; border-radius: 50%; background: var(--muted); opacity: .5; flex: none; }
      .word {
        max-width: 168px; padding: 2px 9px; border-radius: 999px;
        background: var(--accent-weak); color: var(--accent);
        font-weight: 600; font-size: 11.5px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .grow { flex: 1; }
      .close {
        flex: none; display: grid; place-items: center; width: 26px; height: 26px;
        cursor: pointer; border: 0; border-radius: 7px; background: none;
        color: var(--muted); padding: 0; transition: background .12s, color .12s;
      }
      .close:hover { background: var(--hover); color: var(--text); }
      .thread {
        display: flex; flex-direction: column; gap: 11px;
        padding: 13px 14px; max-height: 280px; overflow-y: auto;
        scrollbar-width: thin; scrollbar-color: var(--border) transparent;
      }
      .thread::-webkit-scrollbar { width: 8px; }
      .thread::-webkit-scrollbar-thumb {
        background: var(--border); border-radius: 8px; border: 2px solid var(--bg);
      }
      .thread::-webkit-scrollbar-track { background: transparent; }
      .msg {
        white-space: pre-wrap; overflow-wrap: break-word;
        animation: msg .18s ease-out;
      }
      @keyframes msg { from { opacity: 0; transform: translateY(3px); } }
      .msg.ai { color: var(--text); }
      .msg.you {
        align-self: flex-end; max-width: 84%; background: var(--user-bg);
        color: var(--text); padding: 8px 11px; font-size: 13px;
        border-radius: 13px 13px 4px 13px;
      }
      .loading { display: inline-flex; gap: 5px; align-items: center; padding: 5px 0; }
      .loading i {
        width: 6px; height: 6px; border-radius: 50%; background: var(--muted);
        opacity: .4; animation: bounce 1.3s ease-in-out infinite;
      }
      .loading i:nth-child(2) { animation-delay: .18s; }
      .loading i:nth-child(3) { animation-delay: .36s; }
      @keyframes bounce {
        0%, 80%, 100% { transform: translateY(0); opacity: .35; }
        40% { transform: translateY(-4px); opacity: .9; }
      }
      .status { color: var(--muted); font-size: 12.5px; }
      .err { color: var(--err); }
      .caret {
        display: inline-block; width: 2px; height: 1.05em; margin-left: 2px;
        vertical-align: text-bottom; background: var(--accent); border-radius: 1px;
        animation: blink 1s steps(2) infinite;
      }
      @keyframes blink { 50% { opacity: 0; } }
      .composer {
        display: flex; gap: 8px; align-items: center;
        padding: 10px 12px; border-top: 1px solid var(--hairline);
      }
      .ask {
        flex: 1; min-width: 0; padding: 9px 12px; border-radius: 10px;
        border: 1px solid var(--border); background: var(--bg); color: var(--text);
        font: inherit; font-size: 13px; outline: none;
        transition: border-color .12s, box-shadow .12s;
      }
      .ask::placeholder { color: var(--muted); }
      .ask:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
      .ask:disabled { opacity: .55; }
      .send {
        flex: none; width: 34px; height: 34px; border-radius: 10px; border: 0;
        cursor: pointer; color: #fff; display: grid; place-items: center;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        transition: filter .12s, transform .08s;
      }
      .send:hover:not(:disabled) { filter: brightness(1.08); }
      .send:active:not(:disabled) { transform: scale(.94); }
      .send:disabled { opacity: .45; cursor: default; }
      .foot {
        padding: 7px 12px 10px; font-size: 10.5px; color: var(--muted);
        text-align: center; letter-spacing: .02em;
      }
      @media (prefers-reduced-motion: reduce) {
        .card, .msg, .loading i, .caret { animation: none; }
      }
    </style>
    <div class="card" role="dialog" aria-label="Whatsit explanation">
      <div class="head">
        <span class="logo"></span>
        <span class="brandname">Whatsit</span>
        <span class="sep"></span>
        <span class="word"></span>
        <span class="grow"></span>
        <button class="close" aria-label="Close">${CLOSE_SVG}</button>
      </div>
      <div class="thread"></div>
      <div class="composer">
        <input class="ask" type="text" placeholder="Ask a follow-up…" aria-label="Ask a follow-up" />
        <button class="send" aria-label="Send" disabled>${SEND_SVG}</button>
      </div>
      <div class="foot">On-device · private · nothing leaves your machine</div>
    </div>`.replace(
    '<span class="word"></span>',
    `<span class="word">${escapeHtml(word.slice(0, 80))}</span>`,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
