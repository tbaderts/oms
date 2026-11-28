---
aliases: [architecture/kb-explorer]
type: Component
title: "KB Explorer"
description: "kb-explorer, from the knowledge-server repository: a React web UI for browsing and searching the knowledge repositories that kb-server serves."
tags: [component, react, knowledge-base, ui]
status: draft
updated: "2026-11-28T12:00:00Z"
component: "kb-explorer"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-explorer/src/App.tsx"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-explorer/package.json"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-explorer/src/theme/tokens.css"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-explorer/src/theme/styleRules.test.ts"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-explorer/src/okf/searchSession.ts"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-explorer/src/okf/sidebar.ts"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-explorer/src/App.test.tsx"
---
# KB Explorer

`kb-explorer` is the web UI of the [Knowledge Server](knowledge-server.md). Both live in the
[knowledge-server](https://github.com/tbaderts/knowledge-server) repository; the UI moved out of
this repository in SPEC-0080.

- **Running it.** The knowledge-server `docker compose` runs it at `http://localhost:8097`, behind
  nginx, which proxies `/api` and `/mcp` to kb-server. For development, `npm run dev` proxies `/api`
  to a kb-server on port 8091.
- **Data.** It reads the kb-server REST API, `/api/kb`: repositories, documents, sections, links
  and search.

Capability: [Knowledge Services](../capabilities/knowledge-services.md).

## Repositories

kb-server can serve several knowledge repositories; for OMS it serves `oms-knowledge-base`.
- **The Folders view** has a section per repository when there is more than one. An unavailable
  repository, whose directory was not found, is shown disabled. With a single repository the tree
  looks as before.
- **Search** gets a repository filter when there is more than one repository.
- **Repository badges:** every result and every document header shows its repository.

## OKF-aware

- *Types* and *Folders* sidebar views, with status and trust filters;
- a metadata header per document;
- a links / "cited by" panel (`/api/kb/documents/links`);
- in-app navigation of links between documents, and `?doc=<path>#anchor` deep links.

## Look and feel

- **Its own design tokens.** It keeps a dark, slate palette with one green accent in
  `src/theme/tokens.css` (`--kb-*` custom properties). These started as a copy of the oms-ui tokens
  and are no longer kept in sync with them.
- **How the tokens are wired:**
  - Tailwind's own palette and type scale are replaced by the tokens, so classes read `bg-surface`,
    `text-muted`, `border-border`.
  - `src/theme/styleRules.test.ts` rejects hard-coded colours, palette classes, literal font sizes
    and uppercase or letter-spaced labels.
  - `src/theme/contrast.test.ts` checks WCAG contrast.
- **The shell** has its own mark and the title "KB Explorer", and is dark only.
- **Badges** use the tone tokens:

  | Badge | Values and tones |
  |---|---|
  | Status | stable success, draft warning, deprecated neutral |
  | Trust | human-reviewed success, machine-confirmed info, unverified warning |
  | Type | violet |
  | Stale | danger |

## Search

- **The search sits in the header,** as one bar: the query, the repository, type and tag filters,
  and a Keyword / Semantic / Hybrid segmented control. Enter searches.
- **Switching the mode re-runs an active search** with the same query and filters.
- **Results are kept.** Opening a result shows the document with **← Back to results (n)**, which
  returns to the same results without searching again. Browser Back and Forward keep the results
  too.
- **Ranks, not percentages.** Hits show their rank (`#1`, `#2`, …), because the server's scores are
  rank-fusion values. In Hybrid mode a hit also says whether keyword, meaning or both matched it.
- **Keyboard.** `/` focuses the search, except while typing in a field. `Esc` in the search clears
  it and returns to the document.
- **Loading and errors stay inline.** A failed search or document load shows an inline error with
  the reason (and Retry for a search), never an empty pane.
- **Implementation.** The rules live in a pure reducer, `src/okf/searchSession.ts`.

## Tests

- `npm test` runs the plain-TypeScript models under `src/okf/`, `src/services/` and the theme rules
  with `node --test`, then the component tests with Vitest and Testing Library in jsdom.
- `npm run build` runs the tests first.
- On Windows, `npm` started from Git Bash runs scripts with a lower-case drive letter, which makes
  Vitest load itself twice. `npm test` therefore starts Vitest through `scripts/run-vitest.mjs`, so
  use `npm test` rather than `npx vitest run` from that shell.

Context: [System Context](../architecture/context/system-context.md).
