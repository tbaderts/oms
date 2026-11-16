# Tasks — SPEC-0066: Align oms-kb-explorer look and feel with oms-ui

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Add the component-test toolchain: dev deps `vitest`, `@testing-library/react`, `@testing-library/dom`, `jsdom`; `vitest.config.ts` (jsdom, `src/**/*.test.tsx`); scripts `test` = node tests + vitest, `build` = `npm test && tsc -b && vite build` (AC-9)
  - files: oms-kb-explorer/package.json, oms-kb-explorer/package-lock.json, oms-kb-explorer/vitest.config.ts, oms-kb-explorer/tsconfig.app.json
  - verify: `cd oms-kb-explorer && npm test` passes (existing node suites green, vitest finds no files yet or passes)
- [x] **T-2** Write the failing `src/theme/tokens.test.ts`, then add `src/theme/tokens.css` as an exact copy of oms-ui's tokens (AC-1)
  - files: oms-kb-explorer/src/theme/tokens.test.ts, oms-kb-explorer/src/theme/tokens.css
  - verify: `cd oms-kb-explorer && node --test src/theme/tokens.test.ts` passes
- [x] **T-3** Write the failing `src/theme/contrast.test.ts` (ported from oms-ui, explorer tones) (AC-3)
  - files: oms-kb-explorer/src/theme/contrast.test.ts
  - verify: `cd oms-kb-explorer && node --test src/theme/contrast.test.ts` passes
- [x] **T-4** Write the failing `src/theme/styleRules.test.ts` (no hex/rgb/hsl, palette classes, literal font sizes, uppercase or tracking) and see it fail on today's sources (AC-2)
  - files: oms-kb-explorer/src/theme/styleRules.test.ts
  - verify: `cd oms-kb-explorer && node --test src/theme/styleRules.test.ts` fails listing today's violations (red; turns green in T-11)
- [x] **T-5** Write the failing `src/okf/searchSession.test.ts` and `src/okf/keyboard.test.ts`, then implement `searchSession.ts` (reducer) and `keyboard.ts` (`isTypingTarget`) (AC-5, AC-6, AC-7)
  - files: oms-kb-explorer/src/okf/searchSession.test.ts, oms-kb-explorer/src/okf/searchSession.ts, oms-kb-explorer/src/okf/keyboard.test.ts, oms-kb-explorer/src/okf/keyboard.ts
  - verify: `cd oms-kb-explorer && node --test src/okf/searchSession.test.ts src/okf/keyboard.test.ts` passes
- [x] **T-6** Write the failing `src/App.test.tsx` covering the shell, compact search with mode re-run, kept results, keyboard, loading and errors, and the deep link (AC-4, AC-5, AC-6, AC-7, AC-8, AC-9)
  - files: oms-kb-explorer/src/App.test.tsx
  - verify: `cd oms-kb-explorer && npx vitest run` fails on the new behaviour assertions (red), not on setup errors
- [x] **T-7** Theme the app on tokens: `index.css` imports `tokens.css` and sets the Tailwind `@theme` mapping (palette and type scale replaced), dark only, `.markdown-content` on tokens; delete `App.css` (AC-2, AC-4)
  - files: oms-kb-explorer/src/index.css, oms-kb-explorer/src/App.css
  - verify: `cd oms-kb-explorer && npx vite build` succeeds
- [x] **T-8** App shell: copy `AcmeLogo` (accent via token), the header with logo, divider and "Knowledge Base", the footer "© year Acme Capital · Knowledge Base", and remove the theme toggle and state (AC-4)
  - files: oms-kb-explorer/src/components/AcmeLogo.tsx, oms-kb-explorer/src/App.tsx
  - verify: `cd oms-kb-explorer && npx vitest run -t "Acme Capital shell"` passes
- [x] **T-9** Search ergonomics: `App.tsx` on the `searchSession` reducer with a request-id guarded search effect; compact `SearchBar` in the header (segmented mode control, filters, no emoji, Enter submits); `/` and `Esc` handling; "Back to results (n)" bar (AC-5, AC-6, AC-7)
  - files: oms-kb-explorer/src/App.tsx, oms-kb-explorer/src/components/SearchBar.tsx
  - verify: `cd oms-kb-explorer && npx vitest run -t "re-runs the search|keeps the results|slash focuses|compact row"` passes
- [x] **T-10** Loading and error states: inline `role="status"` progress in `SearchResults`, `role="alert"` search error with Retry, `role="alert"` document load error in `DocumentViewer`; remove the page-wide overlay (AC-8)
  - files: oms-kb-explorer/src/components/SearchResults.tsx, oms-kb-explorer/src/components/DocumentViewer.tsx, oms-kb-explorer/src/App.tsx
  - verify: `cd oms-kb-explorer && npx vitest run -t "progress in the results pane|failed search|failed document"` passes
- [x] **T-11** Restyle every component on tokens: `Badges` (tone badges, no uppercase), `TreeView` (segmented toggle, chips, selection), `DocumentHeader`, `SearchResults`, `TableOfContents`, `LinksPanel`; `codeTheme.ts` for Prism; Mermaid colours from computed tokens (AC-2, AC-3)
  - files: oms-kb-explorer/src/components/Badges.tsx, oms-kb-explorer/src/components/TreeView.tsx, oms-kb-explorer/src/components/DocumentHeader.tsx, oms-kb-explorer/src/components/SearchResults.tsx, oms-kb-explorer/src/components/TableOfContents.tsx, oms-kb-explorer/src/components/LinksPanel.tsx, oms-kb-explorer/src/components/DocumentViewer.tsx, oms-kb-explorer/src/components/MermaidDiagram.tsx, oms-kb-explorer/src/theme/codeTheme.ts
  - verify: `cd oms-kb-explorer && node --test src/theme/styleRules.test.ts` passes
- [x] **T-12** Update the knowledge base: `tools/kb-explorer.md` and `ui/design-system.md` (Other apps)
  - files: oms-knowledge-base/tools/kb-explorer.md, oms-knowledge-base/ui/design-system.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no errors
- [x] **T-13** Run the module build (all tests) and spec verify, then the manual visual check against the running knowledge server (all ACs)
  - files: (none)
  - verify: `cd oms-kb-explorer && npm run build` passes and `node specs/tools/spec.mjs verify SPEC-0066` exits 0
- [x] **T-14** AC-9 regression tests for what the diff touched: Back/Forward (`pushState` + `popstate` round trip), `?doc=…#anchor` scrolls to the anchor, TOC and links panel with data (clicking a link opens its document), the tree's Types/Folders toggle and a status filter (AC-9)
  - files: oms-kb-explorer/src/App.test.tsx
  - verify: `cd oms-kb-explorer && node scripts/run-vitest.mjs -t "Back/Forward|anchor|table of contents|links panel|Types and Folders|filter"` passes
- [x] **T-15** Close the AC-2 scanner's blind spots: comment stripping that keeps `://`, named colours and `oklch/hwb/lab/lch/color-mix`, arbitrary colour values `bg-[…]`, palette classes before `${`, `fontSize=` / `letterSpacing` / `font:` shorthand / non-unit `font-size`, removed Tailwind sizes; an explicit, reasoned allow-list for the logo's SVG geometry; a self-test per rule (AC-2)
  - files: oms-kb-explorer/src/theme/styleRules.test.ts, oms-kb-explorer/src/components/AcmeLogo.tsx
  - verify: `cd oms-kb-explorer && node --test src/theme/styleRules.test.ts` passes, including the self-tests for every listed form
- [x] **T-16** Replace proxy assertions: `/` on the body is default-prevented; after `Esc` the document view is shown; while searching, the only status or overlay is inside the results pane (AC-7, AC-8)
  - files: oms-kb-explorer/src/App.test.tsx
  - verify: `cd oms-kb-explorer && node scripts/run-vitest.mjs -t "slash focuses|progress in the results pane"` passes
- [x] **T-17** `clear` and an empty submit cancel an in-flight search (bump `request`), with a reducer test (AC-7)
  - files: oms-kb-explorer/src/okf/searchSession.ts, oms-kb-explorer/src/okf/searchSession.test.ts
  - verify: `cd oms-kb-explorer && node --test src/okf/searchSession.test.ts` passes
- [x] **T-18** Housekeeping: README matches the behaviour (no theme toggle, Enter to search, test setup); drop `passWithNoTests`; `run-vitest.mjs` reports a spawn failure (AC-9)
  - files: oms-kb-explorer/README.md, oms-kb-explorer/vitest.config.ts, oms-kb-explorer/scripts/run-vitest.mjs
  - verify: `cd oms-kb-explorer && npm test` passes and the README no longer mentions a theme toggle or a Search button
- [x] **T-19** Re-run the module build and spec verify after the review fixes
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0066` exits 0

## Notes

- **T-14 to T-19 were added after the independent review in verify**, which returned NOT MET.
  Implement was reopened. The tasks map to the review findings:
  - T-14: finding 1;
  - T-15: findings 2 and 3;
  - T-16: finding 4;
  - T-17: finding 5;
  - T-18: findings 6, 7 and 9.

  Finding 8 (rank instead of "relevance %") is recorded in design.md and will be called out in
  verification.md as added scope.
