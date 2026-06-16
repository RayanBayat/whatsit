// Validates and visualizes the module graph. Two jobs:
//   1. Enforce the architecture in CI (the rules below).
//   2. Generate a ground-truth dependency graph (`npm run dep:graph`).
// Docs: https://github.com/sverweij/dependency-cruiser

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular dependencies make code hard to reason about and to tree-shake. Refactor to break the cycle.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'ai-providers-via-index',
      severity: 'error',
      comment:
        'The browser-specific AI providers (chrome.ts / firefox.ts) may only be reached through utils/ai/index.ts — the seam that picks one at build time so the other tree-shakes away. Import from "../utils/ai", never a provider file directly.',
      from: {
        pathNot: [
          'utils/ai/index\\.ts$',
          'utils/ai/(chrome|firefox)\\.ts$',
          '^tests/',
        ],
      },
      to: { path: 'utils/ai/(chrome|firefox)\\.ts$' },
    },
  ],
  options: {
    // Only our own source — drops node_modules, #imports, wxt/* virtuals.
    includeOnly: '^(entrypoints|utils|types)/',
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true, // follow `import type` edges too
    exclude: { path: 'node_modules|\\.output|\\.wxt' },
  },
};
