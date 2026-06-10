// Content script: on "whatsit:start", capture the selection + surrounding
// paragraph, show a shadow-DOM overlay near the selection, and stream the
// service worker's answer into it.

(() => {
  if (window.__whatsitLoaded) return; // injected on every menu click — run once
  window.__whatsitLoaded = true;

  let host = null; // current overlay host element

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'whatsit:start') start();
  });

  function start() {
    const sel = window.getSelection();
    const word = sel?.toString().trim().slice(0, 200);
    if (!word || !sel.rangeCount) return;

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const context = surroundingText(sel, word);
    const ui = showOverlay(word, rect);

    const port = chrome.runtime.connect({ name: 'whatsit' });
    let answer = '';
    port.onMessage.addListener((m) => {
      if (m.type === 'chunk') {
        answer += m.text;
        ui.setStreaming(answer);
      } else if (m.type === 'status') {
        ui.setStatus(m.message);
      } else if (m.type === 'done') {
        ui.setFinal(answer);
      } else if (m.type === 'error') {
        ui.setFinal(m.message);
      }
    });
    port.onDisconnect.addListener(() => {
      if (!answer) ui.setFinal('Lost connection to the model. Try again.');
    });
    port.postMessage({ word, context, title: document.title.slice(0, 120) });

    // Closing the overlay aborts the stream by disconnecting the port.
    host.addEventListener('whatsit:closed', () => port.disconnect(), { once: true });
  }

  // Walk up from the selection to a block element with enough text, then
  // clamp to ~600 chars centered on the selected word.
  function surroundingText(sel, word) {
    const BLOCKS = new Set([
      'P', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'ARTICLE', 'SECTION', 'DIV',
      'MAIN', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'PRE', 'FIGCAPTION',
    ]);
    let node = sel.getRangeAt(0).commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    let block = node;
    while (
      block &&
      block !== document.body &&
      !(BLOCKS.has(block.tagName) && (block.innerText || '').length > 40)
    ) {
      block = block.parentElement;
    }
    let text = ((block || document.body).innerText || '').replace(/\s+/g, ' ');
    if (text.length > 600) {
      const idx = text.indexOf(word);
      const center = idx >= 0 ? idx + word.length / 2 : text.length / 2;
      const start = Math.max(0, Math.floor(center - 300));
      text = text.slice(start, start + 600);
    }
    return text.trim();
  }

  // The card should feel native to the page it sits on: light card on light
  // pages, dark card on dark pages. OS theme is irrelevant here.
  function pageIsDark() {
    let el = document.body;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      const m = bg?.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/);
      if (m && (m[4] === undefined || parseFloat(m[4]) > 0.1)) {
        return 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3] < 128;
      }
      el = el.parentElement;
    }
    return false; // all transparent — pages default to white
  }

  function showOverlay(word, rect) {
    closeOverlay();
    host = document.createElement('div');
    host.style.cssText = 'all: initial; position: absolute; z-index: 2147483647;';

    const margin = 8;
    const width = Math.min(340, document.documentElement.clientWidth - 2 * margin);
    host.style.left =
      Math.min(
        Math.max(margin, rect.left + window.scrollX),
        window.scrollX + document.documentElement.clientWidth - width - margin,
      ) + 'px';
    host.style.top = rect.bottom + window.scrollY + margin + 'px';

    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        .card {
          --bg: #ffffff;
          --text: #1f2328;
          --muted: #69707a;
          --border: rgba(0, 0, 0, 0.12);
          --hover: rgba(0, 0, 0, 0.06);
          --shimmer: rgba(0, 0, 0, 0.08);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 10px 28px rgba(0, 0, 0, 0.14);
        }
        .card.dark {
          --bg: #232329;
          --text: #ececf0;
          --muted: #9a9aa6;
          --border: rgba(255, 255, 255, 0.12);
          --hover: rgba(255, 255, 255, 0.08);
          --shimmer: rgba(255, 255, 255, 0.1);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4), 0 10px 28px rgba(0, 0, 0, 0.5);
        }
        .card {
          width: ${width}px;
          box-sizing: border-box;
          background: var(--bg);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px 14px 10px;
          font: 13.5px/1.55 system-ui, -apple-system, sans-serif;
          animation: enter 140ms ease-out;
        }
        @keyframes enter {
          from { opacity: 0; transform: translateY(4px); }
        }
        .head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .word {
          font-weight: 600;
          font-size: 14px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .close {
          flex: none;
          display: grid;
          place-items: center;
          width: 24px;
          height: 24px;
          cursor: pointer;
          border: none;
          border-radius: 6px;
          background: none;
          color: var(--muted);
          font-size: 15px;
          line-height: 1;
          padding: 0;
        }
        .close:hover { background: var(--hover); color: var(--text); }
        .close:focus-visible { outline: 2px solid #4a7dbd; outline-offset: 1px; }
        .body {
          white-space: pre-wrap;
          overflow-wrap: break-word;
          max-height: 280px;
          overflow-y: auto;
        }
        .loading { display: grid; gap: 7px; padding: 3px 0 5px; }
        .loading i {
          height: 10px;
          border-radius: 4px;
          background: var(--shimmer);
          animation: pulse 1.2s ease-in-out infinite;
        }
        .loading i:last-child { width: 70%; animation-delay: 0.15s; }
        @keyframes pulse { 50% { opacity: 0.45; } }
        .status { color: var(--muted); }
        .caret {
          display: inline-block;
          width: 2px;
          height: 1em;
          margin-left: 1px;
          vertical-align: text-bottom;
          background: var(--muted);
          animation: blink 1s steps(2) infinite;
        }
        @keyframes blink { 50% { opacity: 0; } }
        .foot {
          margin-top: 8px;
          padding-top: 7px;
          border-top: 1px solid var(--border);
          font-size: 11px;
          color: var(--muted);
        }
        @media (prefers-reduced-motion: reduce) {
          .card, .loading i, .caret { animation: none; }
        }
      </style>
      <div class="card${pageIsDark() ? ' dark' : ''}" role="dialog" aria-label="Whatsit explanation">
        <div class="head">
          <span class="word"></span>
          <button class="close" aria-label="Close">✕</button>
        </div>
        <div class="body"><div class="loading"><i></i><i></i></div></div>
        <div class="foot">Whatsit · on-device AI · private</div>
      </div>`;

    shadow.querySelector('.word').textContent = word.slice(0, 60);
    shadow.querySelector('.close').addEventListener('click', closeOverlay);
    document.documentElement.appendChild(host);

    // Flip above the selection when there's no room below (and room above).
    // translateY(-100%) anchors the card's bottom edge, so streamed text
    // grows upward instead of covering the selection.
    const cardH = host.offsetHeight;
    if (
      rect.bottom + margin + cardH > document.documentElement.clientHeight &&
      rect.top > cardH + 2 * margin
    ) {
      host.style.top = rect.top + window.scrollY - margin + 'px';
      host.style.transform = 'translateY(-100%)';
    }

    setTimeout(() => {
      document.addEventListener('mousedown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);

    const body = shadow.querySelector('.body');
    return {
      setStreaming(text) {
        body.textContent = text;
        const caret = document.createElement('span');
        caret.className = 'caret';
        body.appendChild(caret);
      },
      setStatus(message) {
        body.innerHTML = '';
        const s = document.createElement('span');
        s.className = 'status';
        s.textContent = message;
        body.appendChild(s);
      },
      setFinal(text) {
        body.textContent = text;
      },
    };
  }

  function onOutside(e) {
    if (host && !e.composedPath().includes(host)) closeOverlay();
  }

  function onKey(e) {
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
})();
