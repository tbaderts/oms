# Design — SPEC-0066: Align oms-kb-explorer look and feel with oms-ui

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

All of the work is in `oms-kb-explorer/`, a Vite + React 19 + Tailwind v4 single-page app.
- **Data.** It reads `http://localhost:8091/api/kb` (oms-mcp-server's REST API) through
  `src/services/api.ts`, using TanStack Query.
- **Pure logic** lives in `src/okf/*.ts` (sidebar grouping, search decoration, links, header,
  status) and is tested with `node --test` (`npm test`).
- **The module's spec verify command** is `npm run build` (`tsc -b && vite build`).

**Today's UI:**
- `App.tsx` has a header (FileText icon, title, theme toggle), a full-width search row, the tree,
  the main pane (search results *or* document), the TOC with the links panel, and a "v1.0" footer.
- Styling is Tailwind utility classes on the default palette: 128 palette-class uses across 11
  files. `index.css` styles `.markdown-content` with `@apply` on gray, blue and pink. `App.css` is
  unused Vite boilerplate, imported nowhere.
- `DocumentViewer` colours code with the third-party `vscDarkPlus` Prism theme, and watches the
  root class for theme changes. `MermaidDiagram` initialises mermaid with `theme: 'dark' | 'default'`.

**The reference** is the oms-ui design system (`oms-knowledge-base/ui/design-system.md`):
- `oms-ui/frontend/src/theme/_tokens.scss` holds the `--oms-*` tokens.
- `theme/styleRules.test.ts` enforces tokens only.
- `theme/contrast.test.ts` checks WCAG contrast.
- The app shell is in `App.tsx` / `App.scss`: a 56 px header with `AcmeLogo`, a divider and a muted
  title, segmented controls, and the footer "© year Acme Capital · <app>".
- `components/AcmeLogo.tsx` is the logo.

The closest examples, which this design copies in kind:
- oms-ui's token, contrast and style-rule tests;
- oms-ui's shell markup;
- the developer cockpit's vitest + Testing Library component tests (e.g.
  `developer-cockpit/test/renderer/KbChatPanel.test.tsx`).

## Approach

### 1. Tokens: `src/theme/tokens.css` (new)

- **The file** is a verbatim copy of oms-ui's `:root { --oms-…: …; }` block, as plain CSS, since
  `_tokens.scss` holds only custom properties. Its header comment says it mirrors oms-ui and that
  `tokens.test.ts` enforces it.
- **Tailwind.** `src/index.css` imports it and maps the tokens into Tailwind v4's theme, *replacing*
  the default palette and type scale:
  ```css
  @import "tailwindcss";
  @import "./theme/tokens.css";
  @theme {
    --color-*: initial;            /* no gray-500, blue-600, … classes exist any more */
    --color-bg: var(--oms-bg);
    --color-surface: var(--oms-surface);
    --color-raised: var(--oms-surface-raised);
    --color-overlay: var(--oms-surface-overlay);
    --color-text: var(--oms-text);
    --color-muted: var(--oms-text-muted);
    --color-strong: var(--oms-text-strong);
    --color-on-accent: var(--oms-text-on-accent);
    --color-accent: var(--oms-accent);  /* + accent-hover, accent-bg, accent-bg-strong */
    --color-success: …; --color-success-bg: …;  /* every tone and its -bg */
    --color-border: var(--oms-border); /* + border-light, border-strong, border-hover */
    --color-hover: var(--oms-hover); --color-selection: var(--oms-selection);
    --color-input: var(--oms-input-bg); --color-input-border: var(--oms-input-border);
    --color-focus: var(--oms-focus-ring);
    --text-*: initial;
    --text-2xs: var(--oms-font-size-2xs); /* … through */ --text-xl: var(--oms-font-size-xl);
    --radius-sm: var(--oms-radius-sm); --radius-md: var(--oms-radius-md); --radius-lg: var(--oms-radius-lg);
    --font-sans: var(--oms-font-family); --font-mono: var(--oms-font-mono);
  }
  ```
- **The result.** Classes read `bg-surface text-muted border-border text-sm rounded-md`. Every colour
  and size goes through a token. Because `--color-*: initial` removes the default palette, a stray
  `bg-gray-800` generates no CSS, and the AC-2 test also rejects it in source.
- **Dark only.** `html` gets `color-scheme: dark`, and the `dark:` variant and the theme state are
  removed.

### 2. App shell (`App.tsx`)

- **Header** (`h-14`, `bg-surface`, bottom border), as in oms-ui:
  - `AcmeLogo`, copied into `src/components/AcmeLogo.tsx`. Its gradient uses `var(--oms-accent)`
    instead of oms-ui's `omsTokens` import, and its text uses `currentColor`.
  - Then a 1 px divider (`bg-border-strong`) and the `<h1>` "Knowledge Base" (`text-lg
    font-medium text-muted`).
  - The compact search bar sits at the right of the header.
- **Footer:** `© {year} Acme Capital · Knowledge Base` on the left. On the right, the existing
  status text (the open document, or the result count).
- **Removed:** the theme toggle, the `theme` state, the `dark:` classes, and `App.css`.

### 3. Search ergonomics (`SearchBar.tsx`, `App.tsx`, new `src/okf/searchSession.ts`)

- **`searchSession.ts`** (pure, tested with `node --test`) is a reducer for the search session:
  `{ query, filters, mode, status: 'idle'|'loading'|'done'|'error', results, error, showing: 'results'|'document' }`.
  Its actions are `submit`, `modeChanged`, `succeeded`, `failed`, `openResult`, `backToResults`
  and `clear`.
  - `openResult` sets `showing: 'document'` and **keeps `results`** (AC-6).
  - `backToResults` sets `showing: 'results'`, with no new request.
  - `modeChanged` with an active query moves to `loading`, so the effect re-runs the search (AC-5).
  - `submit` replaces the results.
  - `clear` empties the query and results and shows the document (AC-7).
- **`App.tsx`** uses `useReducer(searchSession)`. One `runSearch(query, filters, mode)` effect is
  keyed on the *submitted* query, filters and mode, with a request id so a stale answer is ignored.
  Errors go to `failed(message)`, not just the console (AC-8).
- **`SearchBar.tsx`** becomes one row, about 640 px wide, in the header:
  - a search input with an icon and the placeholder "Search the knowledge base (/)";
  - the type `<select>` and the tag input (`text-sm`, input tokens);
  - a segmented control `role="group" aria-label="Search mode"` with three `aria-pressed` buttons:
    "Keyword", "Semantic" and "Hybrid", with no emoji. It reuses oms-ui's mode-toggle look: a
    recessed track with a raised active pill.
  - Enter submits; there is no separate Search button. The single text input submits on Enter, and
    a hidden submit button keeps Enter working with the tag input too.
- **Keyboard (AC-7).** A `useEffect` adds a `keydown` listener on `window`:
  - `/` with no modifier, when `event.target` is not an input, select, textarea or contentEditable,
    calls `preventDefault()` and focuses the search input (through a ref).
  - `Escape` while the search input has focus and a query is set dispatches `clear`.

  `isTypingTarget(target)` lives in `src/okf/keyboard.ts`, which is pure and node-tested.

### 4. Main pane, loading and errors

- **Order of display.** `showing === 'results'` shows `SearchResults`; otherwise `DocumentViewer`.
  When results exist and the document is showing, a bar above the document reads
  "← Back to results (n) for "query"" (a button, AC-6).
- **Loading.** While `status === 'loading'`, `SearchResults` renders an inline progress row
  (`role="status"`, "Searching…") at the top of *its own* pane. The page-wide absolute overlay is
  removed (AC-8).
- **Search error.** `status === 'error'` renders `role="alert"`: "Search failed: <message>" with a
  Retry button, not "No results found".
- **Document error.** `DocumentViewer`'s `useQuery` error state renders `role="alert"`: "Could not
  load <path>: <message>".

### 5. Restyle on tokens, in oms-ui's idiom

Every component swaps palette classes for token classes. Specifically:
- **`Badges.tsx`:**
  - status: stable `success`, draft `warning`, deprecated `neutral` with line-through;
  - trust: human-reviewed `success`, machine-confirmed `info`, unverified `warning`;
  - type: `violet`;
  - stale: `danger`.

  Each badge is `bg-<tone>-bg text-<tone>`, with `text-2xs font-medium rounded-sm px-1.5`, no
  uppercase, no tracking, and `rounded-sm` rather than full pills, as in oms-ui's badges.
- **`TreeView.tsx`:**
  - the Types/Folders toggle becomes the same segmented control;
  - filter chips are `text-2xs` (11 px, up from 10 px) with an accent outline when active;
  - the selected row is `bg-selection text-strong` with a 2 px accent left border, and hover is
    `bg-hover`;
  - sub-group labels lose `uppercase tracking-wider` (`text-2xs text-muted font-medium`);
  - the sidebar width is `w-72`, up from `w-64`, because long titles truncated.
- **`DocumentHeader.tsx`:** `bg-raised border-border rounded-md`; title label without
  uppercase; links in `text-accent`.
- **`index.css` → `.markdown-content`:**
  - text `text`, headings `text-strong`, links `accent`;
  - inline code `bg-raised` with `--oms-syntax-string`;
  - tables with `border` and odd rows on `--oms-odd-row`;
  - blockquote with an `accent` left border;
  - scrollbars on `surface` / `border-strong`.
- **`DocumentViewer.tsx`:**
  - Prism uses a new `src/theme/codeTheme.ts`, a style object whose colours are all
    `var(--oms-syntax-*)` / `var(--oms-text…)` strings, so no third-party palette is used;
  - the theme watcher is removed (dark only).
- **`MermaidDiagram.tsx`:** `theme: 'base'`, with `themeVariables` read at runtime from the tokens
  via `getComputedStyle(document.documentElement).getPropertyValue('--oms-…')`, because mermaid
  needs concrete colours. There are no literals in the source. The `theme` prop is removed.
- **`SearchResults.tsx`, `TableOfContents.tsx`, `LinksPanel.tsx`:** token classes. The
  empty-search help card loses its oversized icon and coloured headings. The match-type badge uses
  tones: hybrid `accent`, keyword `info`, semantic `violet`.

### 6. Tests and the build

- **New dev dependencies:** `vitest`, `@testing-library/react`, `@testing-library/dom` and `jsdom`,
  pinned to the versions `developer-cockpit` uses where they are compatible. See D3.
- **`package.json` scripts:**
  - `"test": "node --test \"src/**/*.test.ts\" && vitest run"`;
  - `"build": "npm test && tsc -b && vite build"`. The module's spec verify (`npm run build`)
    therefore runs every test (the proposal's resolved question);
  - `vitest.config.ts`: `environment: 'jsdom'`, `include: ['src/**/*.test.tsx']`, so vitest never
    picks up the `node:test` files.
- **New `node --test` files:**
  - `src/theme/tokens.test.ts` (AC-1);
  - `src/theme/styleRules.test.ts` (AC-2);
  - `src/theme/contrast.test.ts` (AC-3);
  - `src/okf/searchSession.test.ts` and `src/okf/keyboard.test.ts` (logic behind AC-5–AC-7).
- **New vitest file** `src/App.test.tsx` (AC-4–AC-9). It renders `<App />` with `kbApi` mocked
  through `vi.mock('./services/api')`, and mermaid mocked.

## Contract Changes

None. The REST client (`src/services/api.ts`) and the knowledge server's API are unchanged.

## Data & Persistence

None. There is no storage. The UI keeps no state beyond the session; the theme preference was
never persisted.

## Events & Messaging

None. There is no messaging.

## Domain, State & Orchestration

None in the OMS sense. The only state machine is the UI's search session (step 3), a pure reducer
with tests.

## Alternatives & Decisions

- **D1 — Copy the tokens, with a sameness test.** Chosen over a shared package.
  - Rejected: a shared `oms-design-tokens` package. It is a new module and build step, and it would
    couple the explorer's build to oms-ui's (P-18).
  - Rejected: importing `../../oms-ui/…/_tokens.scss` directly. That path only works inside the
    monorepo, and Vite and Tailwind would need SCSS.
  - The test reads oms-ui's file only to compare, so drift fails the explorer's build. That is
    the signal to sync.
- **D2 — Keep Tailwind, re-themed on tokens.** Chosen over rewriting to SCSS like oms-ui.
  - Tailwind v4 `@theme` with `--color-*: initial` makes the *only* available colours and sizes
    the tokens. That enforces AC-2 at the tool level as well as in the test, and keeps the diff to
    class names, not structure.
  - Rejected: a rewrite to SCSS. That is a much larger change and would add a `sass` dependency
    for no user-visible benefit.
- **D3 — New dev dependencies for component tests:** `vitest`, `@testing-library/react`,
  `@testing-library/dom` and `jsdom` (P-17).
  - The ACs need a rendered app: shell, keyboard, back-to-results, loading and errors. `node --test`
    cannot render React or JSX.
  - Rejected: `react-dom/server` string rendering. It can't test keyboard, focus or interaction.
  - Rejected: Playwright. That is heavier, and needs a running server and browser for every build.
  - The chosen tools are already the repo's standard for React (`developer-cockpit`, and oms-ui's
    Jest + Testing Library). Dev-only, so nothing changes at runtime.
- **D4 — Tests run in `npm run build`.** This puts them in the spec verify evidence without
  editing the gate config, which agents cannot do. The cost is roughly 10 to 20 s more build time.
  The explorer has no Docker build or CI step that this slows. If the requester prefers, `npm test`
  can instead be added to `specs/config.json`, and the build script reverted.
- **D5 — Search state as a pure reducer.** Chosen over more `useState` in `App.tsx`. It keeps the
  rules for kept results, mode re-run and clear testable without a DOM, as the existing `okf/*`
  logic is.
- **D6 — Code and Mermaid colours from tokens.** Prism styles via `var(--oms-syntax-*)`. Mermaid
  reads computed token values at runtime, since it needs concrete colours to derive shades.
  - Rejected: keeping `vscDarkPlus` or mermaid's `dark` theme. They are third-party palettes that
    clash with the slate and green UI. oms-ui's tokens already define syntax colours (its JSON
    viewer).
- **D7 — Delete `App.css`.** It is unused Vite boilerplate, imported nowhere, and holds hex colours.
- **Changed during implementation: vitest 5.1.0, not 3.2.x.** D3 planned the developer cockpit's
  vitest 3.2.7. `npm audit` then reported two **critical** advisories introduced by it: `tinypool`
  (RCE through a prototype-pollution gadget) and `@vitest/mocker` (path traversal), affecting every
  vitest before 5.1.0.
  - 5.1.0 is the fixed release. It supports Vite 7 and Node ≥ 22.12, and was published on
    2026-11-02.
  - With it, no critical or high finding remains. The 9 low and moderate ones (eslint's
    `minimatch`, mermaid's `katex`) predate this ticket.
  - The developer cockpit still runs vitest 3.2.7 and has the same exposure. That is a follow-up.
- **Changed during implementation: the style-rule scanner was refined twice,** each time with a
  test of the rule itself:
  - Palette classes are matched only *with a shade* (`bg-gray-800`) or as `white` / `black`,
    because the token classes `text-neutral` and `bg-violet-bg` share Tailwind's palette names.
  - `fontSize:` is flagged only with a literal number, because `fontSize: var(--oms-font-size-sm)`
    is a token.
- **Changed during implementation: results show rank, not "relevance %".**
  - **Found in the visual check** against the real knowledge server: every keyword hit read
    "Relevance 0%". The API returns reciprocal-rank-fusion scores in every mode (about 1/61 for the
    best hit), not percentages, so the old `score / 100 × 100 %` display was always 0–3 %. The old
    UI had the same defect.
  - **The fix.** Results now show their rank (`#1`, `#2`, …). In hybrid mode they also show which
    signals matched ("Matched by keyword and meaning" / "keyword only" / "meaning only").
  - **Test:** `App.test.tsx#shows each hit by rank, not as a misleading percentage`.
- **Changed during implementation: `scripts/run-vitest.mjs`.**
  - **The problem.** npm started from Git Bash on Windows runs scripts with a lower-case drive
    (`c:\…`). Vitest then loads itself twice, and every component test fails with "Vitest failed
    to find the runner". The spec gate hit this, because it launches `npm run build` from that
    environment.
  - **Evidence.** A scratch experiment ran the same vitest with `C:` and `c:` working directories:
    9/9 passed with `C:`, and the runner error appeared with `c:`.
  - **Rejected.** Pinning vitest's `root` didn't help, because the CLI is already loaded from the
    lower-case path.
  - **The fix.** The launcher upper-cases the drive and starts vitest from there. It is a plain
    `vitest run` elsewhere.

## Risks & Mitigations

- **Tailwind `--color-*: initial` breaks classes the restyle missed.** A missed class produces no
  colour, not a wrong one. The AC-2 scanner fails the build on any palette class, and the manual
  visual check in verify walks every pane.
- **Mermaid diagrams become less readable** with a custom base theme.
  - The theme variables map to the surface, text, border and accent tokens, with mermaid's own
    shade derivation.
  - Verify includes a visual check of a page with a sequence diagram and a flowchart (e.g.
    `domain/concepts/order-lifecycle.md`).
- **Token drift after this ticket.** That is AC-1's purpose: when oms-ui changes a token, the
  explorer's build fails until the copy is synced. The test's failure message names the file to
  copy.
- **`/` and `Esc` clash with typing.** `isTypingTarget` excludes inputs, selects, textareas and
  contentEditable, and is tested. `Esc` acts only while the search input has focus.
- **Slower builds** because tests run first (D4). The suites are small: about 40 node tests and a
  handful of component tests.

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit (node) | `src/theme/tokens.test.ts#explorer tokens equal oms-ui tokens` | parses every `--oms-name: value` in `oms-ui/frontend/src/theme/_tokens.scss` and in `src/theme/tokens.css`; the two maps are deep-equal, and the failure lists missing, extra and changed names |
| AC-2 | unit (node) | `src/theme/styleRules.test.ts` (`#no hard-coded colours`, `#no palette classes`, `#no literal font sizes`, `#no uppercase or letter-spaced labels`) | scans `src/**/*.{ts,tsx,css}` except tests and `theme/tokens.css` for hex / `rgb(` / `hsl(` / named colours in style props, the regex `\b(bg|text|border|ring|from|to|fill|stroke|divide|outline|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-\d{2,3})?\b`, `text-[…px/rem]` / `fontSize:` / CSS `font-size:` with a unit, and `uppercase` / `tracking-` in class strings; each failure names file and line |
| AC-3 | unit (node) | `src/theme/contrast.test.ts` (`#body text meets 4.5:1 on bg, surface, surface-raised`, `#text on the accent meets 4.5:1`, `#muted and badge text meet 3:1`) | WCAG ratios computed from `tokens.css`, with tints composited over `bg` (ported from oms-ui's `contrast.test.ts`); badge tones are the ones the explorer uses: success, warning, neutral, info, violet, danger, accent |
| AC-4 | component (vitest) | `src/App.test.tsx#renders the Acme Capital shell, dark only` | the logo (`aria-label="Acme Capital Logo"`), the `h1` "Knowledge Base", and footer text `© <year> Acme Capital · Knowledge Base`; no button labelled "Toggle theme"; `document.documentElement` has `color-scheme: dark` (or the `dark` class) |
| AC-5 | component + unit | `src/App.test.tsx#switching mode re-runs the search`, `#search bar is one compact row without emoji`; `src/okf/searchSession.test.ts#modeChanged with a query reloads` | after a keyword search, clicking "Semantic" calls `kbApi.searchSemantic` with the same query and filters and the results update; mode buttons are `aria-pressed` in `role="group" name="Search mode"`; no label matches an emoji regex |
| AC-6 | component + unit | `src/App.test.tsx#opening a result keeps the results`; `searchSession.test.ts#openResult keeps results, backToResults restores them, submit replaces them` | open a hit, then "Back to results (2)" shows the same two hits; the search API call count is unchanged; a new query replaces the results |
| AC-7 | component + unit | `src/App.test.tsx#slash focuses search, Esc clears it`; `src/okf/keyboard.test.ts#isTypingTarget` | `/` on the body focuses the input and the input value stays empty; `/` inside the tag input types a `/`; Esc with a query clears the query and results and shows the document |
| AC-8 | component | `src/App.test.tsx#searching shows progress in the results pane only`, `#a failed search shows an inline error`, `#a failed document load shows an inline error` | with a pending promise, `role="status"` "Searching…" is inside the results pane and the tree buttons stay enabled; a rejected search gives `role="alert"` containing "Search failed" and not "No results"; a rejected `readDocument` gives `role="alert"` containing the path |
| AC-9 | component + existing | `src/App.test.tsx#a deep link opens its document`; existing `src/okf/*.test.ts` and `src/services/api.test.ts` | with `?doc=<path>` in the location, `kbApi.readDocument` is called with that path and its content renders; all existing `node --test` suites stay green in `npm test` |

The whole suite runs in `npm run build`, the module's verify command. Verify also includes a
**manual visual check**: the explorer next to oms-ui in a browser against the running knowledge
server, with screenshots. It checks the shell, tree, document with a Mermaid diagram, search,
results, back-to-results and the error state. Look and feel is partly a judgement call that the
ACs bound but don't replace.

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contracts. UI only |
| P-02 | Specification before code, generated models only | n/a | No API or message models. The explorer's REST types are unchanged |
| P-03 | Never edit generated code | comply | No generated code touched |
| P-04 | Contracts evolve compatibly | n/a | No contract changes |
| P-05 | Every state change is recorded in the event log | n/a | No order state |
| P-06 | Kafka only through the transactional outbox | n/a | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | n/a | No database |
| P-08 | Concurrency and idempotency are explicit | comply | Search requests carry a request id. A stale answer, e.g. after a mode switch, is ignored, so results always match the current query and mode |
| P-09 | Commands and queries stay separate | n/a | Read-only UI over the query API |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No order state |
| P-11 | Layering and conventions | comply | Pure logic in `src/okf/` (as existing), the theme in `src/theme/` (as oms-ui), components in `src/components/`. Follows oms-ui's design-system structure and tests |
| P-12 | Jackson 3 only | n/a | TypeScript |
| P-13 | Errors and validation follow the framework specs | comply | API failures are surfaced inline (`role="alert"`) with the reason, never swallowed (today's search only logs to the console) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Every AC maps to tests above, written before the change. The tests run in the module's verify command (D4) |
| P-15 | Observability | n/a | A browser UI dev tool, with no server-side flow or metrics. Errors are now visible to the user instead of only the console |
| P-16 | Security | comply | No secrets, no new network calls. Mermaid keeps `securityLevel` at its default, and the SVG comes from mermaid as today |
| P-17 | Simplicity and dependencies | comply | New **dev** dependencies `vitest`, `@testing-library/react`, `@testing-library/dom` and `jsdom` are justified in D3, with the alternatives rejected. No runtime dependency is added; `App.css` is deleted (D7) |
| P-18 | Modules build standalone | comply | The explorer keeps its own token copy (D1) and builds without oms-ui being built. The sameness test only *reads* oms-ui's source file, which is present in the repo |
| P-19 | Documentation follows behaviour | comply | `tools/kb-explorer.md` and `ui/design-system.md` are updated (below) |

## Knowledge Base Updates

- `oms-knowledge-base/tools/kb-explorer.md`:
  - the look: oms-ui tokens, the Acme shell, dark only;
  - the compact search with its modes (switching re-runs), kept results with "Back to results";
  - the keyboard shortcuts `/` and `Esc`;
  - the inline loading and error states;
  - how to run the tests, which `npm run build` now runs first.
- `oms-knowledge-base/ui/design-system.md`: a short "Other apps" note. The KB explorer uses the same
  tokens through a copy in `oms-kb-explorer/src/theme/tokens.css`, kept identical by its
  `tokens.test.ts`, with its own style-rule and contrast tests. A token change in oms-ui must be
  copied there.
