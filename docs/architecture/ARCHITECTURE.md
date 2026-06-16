# Whatsit architecture

Two kinds of picture, on purpose:

- **Intended architecture** (the story) — hand-drawn, lives in the [README](../../README.md#architecture). The runtime flow and the provider seam.
- **Actual module graph** (ground truth) — *generated from the code* by
  dependency-cruiser, below. It can't drift, because it's regenerated from the
  real imports.

## Module dependency graph (generated)

Regenerate with `npm run dep:graph` (writes `dependency-graph.mmd`); the
snapshot below is that output. Note that `background.ts` reaches the AI layer
**only** through `utils/ai/index.ts` — the providers are never imported directly.

```mermaid
flowchart LR

subgraph 0["entrypoints"]
1["background.ts"]
subgraph I["options"]
J["main.ts"]
end
K["overlay.ts"]
subgraph M["popup"]
N["main.ts"]
end
end
subgraph 2["utils"]
subgraph 3["ai"]
4["index.ts"]
5["chrome.ts"]
7["prompt.ts"]
9["types.ts"]
A["firefox.ts"]
C["models.ts"]
end
6["prompts.ts"]
8["settings.ts"]
B["storage.ts"]
D["control.ts"]
E["control-handler.ts"]
F["conversation.ts"]
G["messages.ts"]
H["sanitize.ts"]
L["page.ts"]
end
subgraph O["types"]
P["ai.d.ts"]
end
1-->4
1-->7
1-->9
1-->D
1-->E
1-->F
1-->G
1-->H
4-->5
4-->A
4-->9
5-->6
5-->8
5-->9
6-->7
A-->6
A-->8
A-->B
A-->C
A-->9
C-->9
D-->9
E-->9
E-->D
F-->9
F-->G
H-->9
J-->D
J-->6
J-->8
K-->G
K-->L
N-->D
N-->6
```

## Enforced boundaries

`npm run dep:check` (run in CI) fails the build on either of these — so the
architecture is guaranteed, not just documented:

| Rule | What it guarantees |
|------|--------------------|
| `no-circular` | No import cycles anywhere — keeps modules independently readable and tree-shakeable. |
| `ai-providers-via-index` | `utils/ai/chrome.ts` and `utils/ai/firefox.ts` are reachable **only** through `utils/ai/index.ts`. Nothing else may import a provider directly, so the build-time pick (`import.meta.env.FIREFOX`) keeps the unused engine out of each browser's bundle. |

Rules live in [`.dependency-cruiser.cjs`](../../.dependency-cruiser.cjs).

## Why this shape

The codebase is deliberately a **deep seam over a shallow surface**: everything
browser-specific hides behind the three-method `AiProvider` interface, so a
reader can follow the whole flow (`background → runLookup → provider → overlay`)
without ever opening Gemini Nano or `browser.trial.ml` code. That's the highest-
leverage move for keeping the project readable without AI assistance — fewer,
deeper modules beat many shallow ones.
