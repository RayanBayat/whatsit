# Whatsit — What's this?

Chrome extension: select any word or phrase on a page, right-click, choose
**What's this?** — and get a streamed AI explanation of what it means *in the
context of what you're reading*. "Apple" in a recipe gets the fruit; "Apple"
in tech news gets the company.

Everything runs on-device via Chrome's built-in Gemini Nano (Prompt API).
No backend, no account, no network calls, no data leaves the machine.

![Whatsit demo — selecting a word and getting a context-aware explanation](assets/demo.gif)

([mp4 version](assets/demo.mp4))

## Quick Start (development)

1. Chrome 138+ on hardware that supports Gemini Nano (~22 GB free disk,
   4 GB VRAM **or** 16 GB RAM + 4 cores).
2. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select the `extension/` folder.
3. Select text on any page → right-click → **What's this?**
   First-ever lookup triggers a one-time model download (a few GB).

## Commands

| Command | Description |
|---------|-------------|
| `node scripts/check.mjs` | Quality gate: manifest validation + JS syntax check |
| `powershell scripts/pack.ps1` | Build a store-ready zip into `dist/` |

CI (GitHub Actions) runs the same gate on every push and uploads the zip as
an artifact.

## Architecture

```
right-click "What's this?"
  → background.js (service worker)
      injects content.js on demand (activeTab + scripting)
      pre-warms a Gemini Nano session in parallel
  → content.js
      captures selection + surrounding paragraph (~600 chars)
      renders a page-adaptive card in a closed shadow DOM
      connects a port back to the worker
  → background.js
      clone()s the warm session, streams the answer over the port
  → content.js streams chunks into the card
```

Three files, no dependencies, no build step.

## Known limits (v0.1)

- Top-frame selections only (no iframes).
- Prompt API output languages: `de, en, es, fr, ja` — no Swedish.
- Hardware-unavailable path is coded but untested (dev machine exceeds gates).

