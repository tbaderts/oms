---
aliases: [architecture/kb-explorer]
type: Component
title: "KB Explorer"
description: "Vite/React web UI for browsing and searching the knowledge base through the MCP server, styled with the OMS design tokens."
tags: [component, react, knowledge-base, ui]
status: draft
updated: "2026-11-16T12:00:00Z"
component: "oms-kb-explorer"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-kb-explorer/src/App.tsx"
  - resource: "repo:oms-kb-explorer/package.json"
  - resource: "repo:oms-kb-explorer/src/theme/tokens.css"
  - resource: "repo:oms-kb-explorer/src/theme/styleRules.test.ts"
  - resource: "repo:oms-kb-explorer/src/okf/searchSession.ts"
  - resource: "repo:oms-kb-explorer/src/App.test.tsx"
---
# KB Explorer

Run locally with `npm run dev`; it is not part of docker-compose.
- **Data.** It reads `/api/kb` of the MCP server (`VITE_KB_API_URL`, default
  `http://localhost:8091/api/kb`). The controller is active in the server's `local` profile.
- **OKF-aware** since SPEC-0012:
  - *Types* and *Folders* sidebar views, with status and trust filters;
  - a metadata header per document;
  - a links / "cited by" panel (`/api/kb/documents/links`);
  - in-app navigation of bundle links.

Capability: [Knowledge Services](../capabilities/knowledge-services.md).

## Look and feel

Since SPEC-0066 the explorer looks like part of the OMS UI.
- **Tokens.** It uses the [Design System](../ui/design-system.md) tokens: slate surfaces, the Acme
  Capital green as the one accent, colour reserved for meaning, and the six-step type scale.
- **Shell.** The header has the Acme Capital logo and the title "Knowledge Base"; the footer reads
  "© year Acme Capital · Knowledge Base".
- **Dark only,** like oms-ui.
- **How the tokens are wired:**
  - `src/theme/tokens.css` is a copy of oms-ui's `_tokens.scss`, and `src/theme/tokens.test.ts`
    fails the build when the two differ.
  - Tailwind's own palette and type scale are replaced by the tokens (`@theme` in `src/index.css`),
    so classes read `bg-surface`, `text-muted`, `border-border`.
  - `src/theme/styleRules.test.ts` rejects hard-coded colours, palette classes, literal font sizes
    and uppercase or letter-spaced labels.
  - `src/theme/contrast.test.ts` checks WCAG contrast.
  - Code blocks use token syntax colours (`src/theme/codeTheme.ts`), and Mermaid diagrams take their
    colours from the tokens at run time.
- **Badges** use the tone tokens:

  | Badge | Values and tones |
  |---|---|
  | Status | stable success, draft warning, deprecated neutral |
  | Trust | human-reviewed success, machine-confirmed info, unverified warning |
  | Type | violet |
  | Stale | danger |

## Search

- **The search sits in the header,** as one bar: the query, the type and tag filters, and a
  Keyword / Semantic / Hybrid segmented control. Enter searches.
- **Switching the mode re-runs an active search** with the same query and filters.
- **Results are kept.** Opening a result shows the document with **← Back to results (n)**, which
  returns to the same results without searching again. A new search replaces them.
  - Browser Back and Forward move between documents and keep the results too.
- **Ranks, not percentages.** Hits show their rank (`#1`, `#2`, …), because the server's scores are
  rank-fusion values, not percentages. In Hybrid mode a hit also says whether keyword, meaning or
  both matched it.
- **Keyboard.** `/` focuses the search, except while typing in a field. `Esc` in the search clears
  it and returns to the document.
- **Loading and errors stay inline.** Progress shows in the results pane while the rest of the UI
  stays usable. A failed search or document load shows an inline error with the reason (and Retry
  for a search), never an empty pane or "No results".
- **Implementation.** The rules live in a pure reducer, `src/okf/searchSession.ts`.

## Tests

- `npm test` runs the plain-TypeScript models under `src/okf/` and the theme rules with
  `node --test`, then the component tests (`src/**/*.test.tsx`) with Vitest and Testing Library in
  jsdom.
- `npm run build` runs `npm test` first, so a broken design rule or behaviour fails the build.
- On Windows, `npm` started from Git Bash runs scripts with a lower-case drive letter (`c:\…`).
  Vitest then loads itself twice and fails with "Vitest failed to find the runner". `npm test`
  therefore starts Vitest through `scripts/run-vitest.mjs`, which upper-cases the drive first, so
  use `npm test` rather than `npx vitest run` from that shell.

Context: [System Context](../architecture/context/system-context.md).
