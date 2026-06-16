// Toolbar popup: the on-device model manager. Talks to the background over the
// control port (utils/control). All model logic lives in the provider's
// manager; this is just UI.

import { browser } from '#imports';
import {
  CONTROL_PORT,
  type ControlMessage,
  type ControlRequest,
  type EngineState,
} from '../../utils/control';
import {
  getPrompts,
  getActivePromptId,
  setActivePromptId,
} from '../../utils/prompts';

const CIRCUMFERENCE = 2 * Math.PI * 20; // matches r="20" in index.html

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const engineEl = byId('engine');
const modelsEl = byId('models');
const cardsEl = byId('cards');
const dlTitleEl = byId('dltitle');
const pillEl = byId('pill');
const downloadBtn = byId<HTMLButtonElement>('download');
const deleteBtn = byId<HTMLButtonElement>('delete');
const msgEl = byId('msg');
const barEl = document.getElementById('bar') as unknown as SVGCircleElement;
const pctEl = byId('pct');
const promptSelect = byId<HTMLSelectElement>('promptselect');
const manageBtn = byId<HTMLButtonElement>('manage');

const port = browser.runtime.connect({ name: CONTROL_PORT });
const send = (msg: ControlRequest) => port.postMessage(msg);

function setRing(percent: number) {
  const clamped = Math.max(0, Math.min(100, percent));
  pctEl.textContent = `${Math.round(clamped)}%`;
  barEl.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - clamped / 100));
}

function setPill(text: string, kind: 'idle' | 'ready' | 'busy') {
  pillEl.textContent = text;
  pillEl.className = `pill ${kind}`;
}

function showError(message: string) {
  msgEl.textContent = message;
  msgEl.hidden = false;
}

function clearError() {
  msgEl.hidden = true;
}

function render(state: EngineState) {
  engineEl.textContent = state.engineLabel;

  // Model picker — Firefox only (Chrome has a single, fixed model).
  if (state.canSelectModel && state.models.length > 1) {
    modelsEl.hidden = false;
    cardsEl.replaceChildren(
      ...state.models.map((m) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `card${m.id === state.activeModelId ? ' selected' : ''}`;
        card.disabled = state.busy;
        card.setAttribute('aria-pressed', String(m.id === state.activeModelId));
        card.addEventListener('click', () => {
          if (m.id !== state.activeModelId) send({ type: 'setModel', id: m.id });
        });

        const mark = document.createElement('span');
        mark.className = 'mark';

        const main = document.createElement('span');
        const title = document.createElement('span');
        title.className = 'card-title';
        title.textContent = `${m.label} · ${m.size}`;
        main.appendChild(title);
        if (m.detail) {
          const detail = document.createElement('span');
          detail.className = 'card-detail';
          detail.textContent = m.detail;
          detail.style.display = 'block';
          main.appendChild(detail);
        }

        card.append(mark, main);
        return card;
      }),
    );
  } else {
    modelsEl.hidden = true;
  }

  const active =
    state.models.find((m) => m.id === state.activeModelId) ?? state.models[0];
  dlTitleEl.textContent = active ? `${active.label} · ${active.size}` : '';

  if (state.busy) {
    setRing(state.progress ?? 0);
    setPill(`Downloading ${Math.round(state.progress ?? 0)}%`, 'busy');
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading…';
  } else if (state.downloaded) {
    setRing(100);
    setPill('Ready', 'ready');
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Re-download';
  } else {
    setRing(0);
    setPill('Not downloaded', 'idle');
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';
  }

  deleteBtn.hidden = !state.canDelete || !state.downloaded;
  deleteBtn.disabled = state.busy;
}

port.onMessage.addListener((raw: unknown) => {
  const msg = raw as ControlMessage;
  if (msg.type === 'state') {
    render(msg.state);
  } else if (msg.type === 'progress') {
    setRing(msg.progress);
    setPill(`Downloading ${msg.progress}%`, 'busy');
  } else if (msg.type === 'done') {
    setRing(100);
    setPill('Ready', 'ready');
  } else if (msg.type === 'error') {
    showError(msg.message);
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';
  }
});

downloadBtn.addEventListener('click', async () => {
  clearError();
  // Firefox's trialML permission must be requested from a user gesture — this
  // click. Chrome needs no extra permission.
  if (import.meta.env.FIREFOX) {
    try {
      const granted = await browser.permissions.request({
        permissions: ['trialML'],
      } as unknown as Parameters<typeof browser.permissions.request>[0]);
      if (!granted) {
        showError('Permission is needed to download the model.');
        return;
      }
    } catch {
      // fall through; the background reports a clear error if it's truly blocked
    }
  }
  send({ type: 'download' });
});

deleteBtn.addEventListener('click', () => {
  clearError();
  send({ type: 'delete' });
});

// --- Prompt selector (reads/writes storage directly) ---
async function loadPrompts() {
  const [prompts, activeId] = await Promise.all([
    getPrompts(),
    getActivePromptId(),
  ]);
  promptSelect.replaceChildren(
    ...prompts.map((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      opt.selected = p.id === activeId;
      return opt;
    }),
  );
}
promptSelect.addEventListener('change', () => {
  void setActivePromptId(promptSelect.value);
});
manageBtn.addEventListener('click', () => {
  void browser.runtime.openOptionsPage();
});

send({ type: 'getState' });
void loadPrompts();
