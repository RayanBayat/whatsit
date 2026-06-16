import { defineConfig } from 'wxt';

// One config, two targets. `wxt` / `wxt build` -> Chrome; add `-b firefox` for
// Firefox. The manifest is a function of the target browser so each store gets
// exactly the keys it needs and nothing it rejects.
export default defineConfig({
  // Firefox 142+ fully supports MV3 (event-page background); keep both targets
  // on MV3 instead of WXT's MV2 default for Firefox.
  manifestVersion: 3,
  // The Firefox sources zip (required by AMO for minified submissions) defaults
  // to bundling the whole repo. Keep business planning, the session export, and
  // the heavy demo media OUT of anything that leaves the machine.
  zip: {
    excludeSources: [
      'private/**',
      'session-*.md',
      'assets/demo.*',
      '*.zip',
    ],
  },
  // The prompt-library editor + diagnostics deserve a full tab, not the cramped
  // embedded options view. WXT defaults options to open_in_tab:false and its
  // generated value wins over a manifest override, so force it after generation.
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      if (manifest.options_ui && typeof manifest.options_ui === 'object') {
        manifest.options_ui.open_in_tab = true;
      }
    },
  },
  // Vanilla TS — no framework module. The overlay is hand-built shadow DOM.
  manifest: ({ browser }) => {
    const base = {
      name: "Whatsit — What's this?",
      description:
        'Select anything, right-click, get an instant AI explanation in context. On-device — no account, no cloud, free.',
      // contextMenus: the only entry point. scripting + activeTab: inject the
      // overlay into the current tab on demand, granted per-click (ADR-002).
      // storage: remember the selected model + download state for the popup.
      // No content_scripts, no host_permissions — no scary install warning.
      permissions: ['contextMenus', 'scripting', 'activeTab', 'storage'],
      action: {
        default_title: "Whatsit: select text, right-click, What's this?",
      },
    };

    if (browser === 'firefox') {
      return {
        ...base,
        // gecko id is mandatory for AMO signing. 142+ ships the WebExtensions
        // ML API (browser.trial.ml) in release. data_collection_permissions:
        // ["none"] is AMO's new mandatory consent field — and literally true
        // here: Whatsit collects nothing.
        browser_specific_settings: {
          gecko: {
            id: 'whatsit@rayanbayat.dev',
            strict_min_version: '142.0',
            data_collection_permissions: { required: ['none'] },
          },
        },
        // trialML is requested at runtime on first lookup (it needs a user
        // gesture, so we ask from the context-menu click).
        optional_permissions: ['trialML'],
      };
    }

    // Chrome / Chromium. 138+ is where the Prompt API (Gemini Nano) is present.
    return { ...base, minimum_chrome_version: '138' };
  },
});
