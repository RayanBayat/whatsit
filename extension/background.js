// Service worker: owns the context menu and the on-device model.
// Content script connects a port per lookup; we stream chunks back.

const SYSTEM_PROMPT =
  'You explain what a selected word or phrase refers to, using the surrounding ' +
  'context to pick the right meaning. Reply with 1-2 short sentences explaining ' +
  'what it means in THIS specific context, then one extra fact relevant to that ' +
  'same contextual meaning. Plain text only, no markdown. Max 50 words total.';

const LANG = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

// Recreate on every worker wake — covers install, browser startup, and update
// in one path; removeAll makes it idempotent.
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: 'whatsit',
    title: 'What’s this? — "%s"',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'whatsit' || !tab?.id) return;
  try {
    // Inject on demand (idempotent — content.js guards against double-load).
    // activeTab grants us this tab only, because the user just invoked us on it.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
    await chrome.tabs.sendMessage(tab.id, { type: 'whatsit:start' });
  } catch (e) {
    // chrome:// pages, the Web Store, and PDFs refuse injection — nothing we can do.
    console.error('Whatsit: cannot run on this page:', e);
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'whatsit') return;
  port.onMessage.addListener((msg) => {
    lookup(msg, port);
  });
});

// One warm base session per worker lifetime; each lookup uses a cheap clone()
// so conversations don't contaminate each other. Status messages reach whichever
// overlay is currently waiting (there is at most one lookup at a time in practice).
let basePromise = null;
let activePost = null;

function getBaseSession() {
  if (!basePromise) {
    basePromise = LanguageModel.create({
      ...LANG,
      initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          // Only fires for a real download (first install) — not a warm load.
          activePost?.({
            type: 'status',
            message: `Downloading on-device model (one-time): ${Math.round(e.loaded * 100)}%`,
          });
        });
      },
    }).catch((e) => {
      basePromise = null; // allow retry on next lookup
      throw e;
    });
  }
  return basePromise;
}

// Pre-warm: the worker wakes on the menu click, so this runs in parallel with
// script injection and selection capture instead of after them.
if (typeof LanguageModel !== 'undefined') getBaseSession().catch(() => {});

async function lookup(msg, port) {
  // Trust boundary: cap everything coming over the port so a page-sized
  // selection can't build an unbounded prompt.
  const word = String(msg?.word ?? '').slice(0, 200);
  const context = String(msg?.context ?? '').slice(0, 700);
  const title = String(msg?.title ?? '').slice(0, 120);
  if (!word) return;

  const post = (m) => {
    try {
      port.postMessage(m);
    } catch {
      // Port closed (overlay dismissed mid-stream) — stop quietly.
    }
  };

  if (typeof LanguageModel === 'undefined') {
    post({
      type: 'error',
      message: 'On-device AI is not available in this Chrome. Whatsit needs Chrome 138+.',
    });
    return;
  }

  let session;
  let isClone = false;
  try {
    const availability = await LanguageModel.availability(LANG);
    if (availability === 'unavailable') {
      post({
        type: 'error',
        message:
          'This device does not support on-device AI (needs ~22 GB free disk and 4 GB VRAM or 16 GB RAM).',
      });
      return;
    }

    activePost = post;
    const base = await getBaseSession();
    try {
      session = await base.clone();
      isClone = true;
    } catch {
      session = base; // clone unsupported — fall back to the shared session
    }

    const stream = session.promptStreaming(
      `Selected: "${word}"\nPage title: "${title}"\nContext: "${context}"`,
    );
    for await (const chunk of stream) {
      post({ type: 'chunk', text: chunk });
    }
    post({ type: 'done' });
  } catch (e) {
    post({ type: 'error', message: 'Lookup failed: ' + (e?.message || e) });
  } finally {
    if (activePost === post) activePost = null;
    if (isClone) session?.destroy(); // never destroy the shared base session
  }
}
