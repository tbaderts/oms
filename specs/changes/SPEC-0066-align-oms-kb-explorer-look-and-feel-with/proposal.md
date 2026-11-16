# Proposal — SPEC-0066: Align oms-kb-explorer look and feel with oms-ui

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The goal asks to improve the look and feel, ergonomics and user experience of `oms-kb-explorer`,
and to bring it closer to `oms-ui`.

**Today the two apps look like different products.**
- oms-ui follows the OMS design system (`oms-knowledge-base/ui/design-system.md`, SPEC-0058 and
  SPEC-0060):
  - a dark, dense UI on `--oms-*` tokens: slate surfaces, the Acme Capital green as the one accent,
    a six-step type scale;
  - an Acme Capital header and footer;
  - tests that keep colours and font sizes on tokens and check WCAG contrast.
- The explorer (`oms-kb-explorer/src`) uses generic Tailwind grays with a **blue** accent
  everywhere (buttons, selection, focus, links):
  - it has a light/dark toggle, a FileText icon instead of the logo, and a "v1.0" footer;
  - 10px uppercase, letter-spaced labels and pills, which the design system rules out;
  - an emoji in the "Hybrid ⭐" button.

**Ergonomics and UX** (from reading `App.tsx`, `SearchBar.tsx`, `SearchResults.tsx` and
`TreeView.tsx`):
- **The search takes a full-width row of its own:** an input, a Search button, a type select, a tag
  input and three mode buttons, under the header.
- **Changing the mode doesn't re-run the search.** The results stay from the old mode until the
  user submits again.
- **Results are lost.** Opening a result clears the search (`handleSelectDoc` empties the query and
  results), so checking several hits means searching again each time.
- **The "Searching…" overlay covers the whole page.** It is `absolute inset-0` on a parent that
  isn't positioned.
- **Failures are silent.** A failed search is only logged to the console and looks like "no
  results"; a failed document load has no specific message.
- **There is no keyboard path** to the search.

If nothing changes, the two OMS tools keep looking unrelated, and every multi-hit search costs a
re-search per hit.

Related: `oms-knowledge-base/tools/kb-explorer.md`, `oms-knowledge-base/ui/design-system.md`.

## What Changes

- **Design tokens.** The explorer uses the oms-ui design tokens, the same `--oms-*` names and
  values, kept identical by a test. Colours and font sizes come only from those tokens.
- **App shell like oms-ui.** A 56 px header with the Acme Capital logo, a divider and the title
  "Knowledge Base", and a footer "© <year> Acme Capital · Knowledge Base". The UI is dark only, as
  in oms-ui, and the theme toggle is removed.
- **Restyled components** on tokens, in oms-ui's idiom: the tree, filter chips, badges, document
  header, document body (Markdown, code, tables), table of contents, links panel and search
  results.
  - Badges use the tone tokens, with no uppercase and no letter spacing.
  - The green accent marks selection, focus and primary actions; blue is only for information.
- **A compact search bar.**
  - It sits in one row: the query input, a segmented Keyword / Semantic / Hybrid control (no
    emoji) and the type and tag filters.
  - Changing the mode while a query is active re-runs the search in the new mode.
- **Results are kept.** Opening a result shows the document with a "Back to results (n)" control,
  which returns to the same results without searching again. A new search replaces them.
- **Keyboard.** `/` focuses the search, unless the user is typing in a field. `Esc` in the search
  clears it and returns to the document.
- **Clear loading and error states.**
  - While searching, a progress indicator shows in the results pane only.
  - A failed search or document load shows an inline error with the reason, not an empty or
    "no results" pane.
- **No change to features or data.** The knowledge-server API, deep links (`?doc=…#anchor`),
  Back/Forward, the Types/Folders tree with its filters, the TOC and the links panel behave as
  today.
- Not breaking for anyone: the explorer is a standalone dev tool, and only its UI changes.

## Scope

### In scope

- `oms-kb-explorer` only: the tokens, app shell, component styling, search ergonomics, kept
  results, keyboard shortcuts, loading and error states, and the tests that enforce them.
- Updating `oms-knowledge-base/tools/kb-explorer.md`, and the design-system page to name the
  explorer as a second user of the tokens.

### Out of scope

- Changes to oms-ui, or extracting a shared design-token package. The explorer carries a copy that
  a test keeps identical, so each module still builds on its own (P-18).
- New explorer features: editing, new filters, a graph view, chat. Search ranking and the API are
  also out of scope.
- A light theme. oms-ui has none; it can come later for both apps together.
- Mobile layouts below 1024 px width.
- Changes to the developer cockpit's Knowledge Base view.

## Acceptance Criteria

- **AC-1** — Given oms-ui's `src/theme/_tokens.scss`, when the explorer's test suite runs, then the
  explorer's token stylesheet defines exactly the same `--oms-*` custom properties with the same
  values. A difference in either direction fails the test.
- **AC-2** — Given the explorer's sources (`src/**/*.{ts,tsx,css}`, tests excluded), when the
  design-rule test runs, then, outside the token stylesheet:
  - no hex colour, `rgb()` / `hsl()` colour or Tailwind palette colour class (`gray-500`,
    `bg-blue-600`, …) appears;
  - no literal font size (`text-[10px]`, `fontSize:`, `px` / `rem` font sizes in CSS) appears;
  - no badge or label uses `uppercase` or letter spacing.
- **AC-3** — Given the explorer's tokens, when the contrast test runs, then:
  - body text meets 4.5:1 on every surface the explorer uses (`bg`, `surface`, `surface-raised`);
  - text on the accent meets 4.5:1;
  - muted text and badge text meet 3:1 on their backgrounds.
- **AC-4** — Given the explorer, when the app renders, then:
  - the header shows the Acme Capital logo and the title "Knowledge Base";
  - the footer reads "© <current year> Acme Capital · Knowledge Base";
  - the root carries the dark theme;
  - no theme toggle is rendered.
- **AC-5** — Given the search bar, then the query input, the Keyword / Semantic / Hybrid segmented
  control and the type and tag filters render in one bar, with no emoji in any label. Given a
  query with results, when the user switches the mode, then the search runs again with the new
  mode and the same query and filters, and the results update.
- **AC-6** — Given results for a query, when the user opens a result, then the document is shown
  with a "Back to results (n)" control. Activating it shows the same results again without a new
  API call. When the user then runs a different query, the old results are replaced.
- **AC-7** — Given focus is not in an input, select or textarea, when the user presses `/`, then
  the search input gets focus and the `/` is not typed into it. Given the search input has a query,
  when the user presses `Esc`, then the query and results are cleared and the document view is
  shown.
- **AC-8** — Given a search request that has not answered yet, when the user looks at the app, then
  a progress indicator shows in the results pane, and the header, tree and search bar stay usable.
  Given the search API fails, when a search runs, then the results pane shows an inline error naming
  the failure, not "No results". Given a document fails to load, when it is opened, then the
  document pane shows an inline error with the path.
- **AC-9** — Given the existing explorer behaviour, when the test suites run after this change,
  then:
  - deep links (`?doc=<path>#anchor`), Back/Forward, the Types/Folders tree with its
    status/trust filters, the table of contents and the links panel still work;
  - the existing `node --test` suites still pass;
  - a component test opens a deep-linked document on load.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-kb-explorer, plus docs in oms-knowledge-base |
| Contracts (OpenAPI / Avro) | none. The explorer's REST client is unchanged |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | none. oms-ui is read by a test as the token reference, and is not changed |
| Knowledge base | `tools/kb-explorer.md` (look and ergonomics); `ui/design-system.md` (the explorer uses the same tokens, kept identical by a test) |

## Open Questions

- [resolved] Share the tokens as a package, or copy them? → assumption: the explorer keeps its own
  copy, and a test fails on any difference from oms-ui's `_tokens.scss` (AC-1). This keeps both
  modules building on their own (P-18) and catches drift. A shared package can come later.
- [resolved] Drop the light theme? → assumption: yes. oms-ui is dark only, and "aligned with
  oms-ui" is the goal. Re-adding a light theme later means adding light token values for both apps.
- [resolved] Component tests need a DOM renderer, but the explorer has only `node --test`. →
  assumption: add a component-test runner as a dev dependency. The design records the choice
  (P-17); `developer-cockpit` and `oms-ui` already use vitest with Testing Library.
- [resolved] The module's spec verify command is only `npm run build`, so tests would not run in
  the automated evidence. → assumption: `npm run build` runs the test suites first. A failing
  design rule, contrast check or component test then fails the build, the way oms-ui's tests gate
  its CI. The alternative is to add `npm test` to `specs/config.json` → `modules.oms-kb-explorer.verify`,
  which is the requester's call, because agents cannot edit the gate config.
- [resolved] Keep Tailwind or move to SCSS like oms-ui? → this is a design decision, not a
  requirement. The ACs constrain only the result: tokens only, no palette classes.
