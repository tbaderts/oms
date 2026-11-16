# Verification — SPEC-0066: Align oms-kb-explorer look and feel with oms-ui

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The module verify command `npm run build` runs `npm test` first: `node --test` with 67 tests, then
Vitest with 16 component tests, then `tsc -b` and `vite build`. All passed in the latest run,
`evidence/oms-kb-explorer-1.log` (2026-11-16T11:27Z). Nothing is skipped, and Vitest no longer
accepts an empty run (`passWithNoTests` removed).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Explorer tokens equal oms-ui's `_tokens.scss` | `src/theme/tokens.test.ts#explorer tokens equal oms-ui tokens`: parses every `--oms-*` in both files and compares missing, extra and changed names | PASS |
| AC-2 | No hard-coded colours, palette classes, literal font sizes, uppercase or letter spacing outside the token file | `src/theme/styleRules.test.ts`: 9 rules (hex; colour functions incl. `oklch` / `hwb` / `lab` / `lch` / `color-mix`; named colours in CSS; named colours in style objects and SVG attributes; palette classes incl. before `${`; arbitrary `bg-[…]` / `text-[…]`; literal font sizes incl. `fontSize=`, `font:`, `font-size: 80%`; sizes outside the token scale; uppercase and letter spacing). **Each rule has a self-test** with strings it must catch and allow. Also comment stripping that keeps `://`, and an explicit allow-list for the logo's SVG geometry, tested as still needed. Tailwind's own palette and type scale are also removed (`@theme { --color-*: initial; --text-*: initial }`) | PASS |
| AC-3 | Contrast: body text 4.5:1 on bg / surface / raised; text on accent 4.5:1; muted and badge text 3:1 | `src/theme/contrast.test.ts` (3 tests), ported from oms-ui. The badge tones the explorer uses are composited over each surface; accent links and the selected tree row are included | PASS |
| AC-4 | Acme Capital header and footer, dark only, no theme toggle | `src/App.test.tsx#renders the Acme Capital shell, dark only`: logo, `h1` "Knowledge Base", footer `© <year> Acme Capital · Knowledge Base`, no "Toggle theme". The dark theme itself is `color-scheme: dark` plus the token surfaces in `index.css`, as seen in the visual check | PASS |
| AC-5 | One compact search bar, no emoji; switching mode re-runs the search | `App.test.tsx#search bar is one compact row without emoji` (inside the header `banner`, `role=group` "Search mode", `aria-pressed`, no pictographs) and `#switching mode re-runs the search` (`searchSemantic` called with the same query and filters, results updated); `src/okf/searchSession.test.ts#modeChanged with a query reloads…` | PASS |
| AC-6 | Opening a result keeps the results; Back to results needs no new call; a new query replaces them | `App.test.tsx#opening a result keeps the results` (`searchKeyword` called once, "Back to results (2)", replaced by the next query); `searchSession.test.ts#openResult keeps results, backToResults restores them, submit replaces them` | PASS |
| AC-7 | `/` focuses search (not in fields, not typed); Esc clears and shows the document | `App.test.tsx#slash focuses search, Esc clears it`: the body keydown is default-prevented, which a **mutation check** confirmed (removing `preventDefault()` fails the test); `/` in the tag field is not prevented; Esc clears the query and results and the document view's heading shows. `src/okf/keyboard.test.ts`. `searchSession.test.ts#clear and an empty submit cancel a search still in flight` | PASS |
| AC-8 | Progress only in the results pane, rest usable; inline errors for search and document | `App.test.tsx#searching shows progress in the results pane only`: exactly one `role=status`, inside the results region; no page-wide overlay; the tree still opens a document while the search is pending. `#a failed search shows an inline error` (`role=alert`, "Search failed", the HTTP code, no "No results"). `#a failed document load shows an inline error` (`role=alert` with the path) | PASS |
| AC-9 | Deep links, Back/Forward, Types/Folders, filters, TOC and links panel still work; existing suites green | `App.test.tsx` `existing behaviour still works`: `#a deep link with an #anchor scrolls to that heading`, `#Back/Forward show the document the URL names` (real `history.back()` / `forward()`), `#Back after opening a search result still offers the kept results`, `#the table of contents lists the sections and the links panel opens a linked document`, `#the tree switches between Types and Folders`, `#a status filter narrows the tree`, plus `#a deep link opens its document`. All pre-existing `node --test` suites pass (`okf/*`, `services/api`, `utils/frontMatter`) | PASS |

**Manual visual check.** I ran the dev server on `localhost:5174` against the running oms-mcp-server
in Chrome. Screenshots are in the session's Chrome screenshot folder.
- **Document view:** the Acme header, the compact search, a Types tree with tone badges, the
  document header, prose with accent links and token code colours, and the TOC.
- **Mermaid:** the order-lifecycle state diagram renders on the token theme and is readable.
- **Search:** `/` → "cancel request" → Enter gives 20 results. Opening one shows
  "← Back to results (20)", which restores them. Hybrid re-runs the search, with "Matched by keyword
  and meaning".
- **Errors:** a missing document shows the inline error with its path.

## Goal Assessment

Goal: *"I want to improve UI look and feel, ergonomics and user experience of oms-kb-explorer. I
think it should be more alligned with oms-ui."*

- **Aligned with oms-ui.** Met. It uses the same tokens, kept identical by a test; the same shell,
  logo and footer; dark only; the same segmented controls and badge idiom; and the same style-rule
  and contrast discipline.
- **Look and feel.** Met. Every component is restyled on tokens: tree, badges, document header,
  Markdown, code, Mermaid, TOC, links panel and results. The emoji and the oversized empty-state
  icons are gone.
- **Ergonomics and UX.** Met:
  - the search is in the header and switching mode re-runs it;
  - results are kept, with Back to results;
  - `/` and Esc work;
  - loading and errors stay inline;
  - the tree is wider.
- **Beyond the ACs, found in the visual check.** Results showed "Relevance 0%" for every hit,
  because the server's scores are rank-fusion values, not percentages. They now show rank, and in
  Hybrid which signals matched. **This is added scope** (the proposal put search ranking out of
  scope): display only, recorded in design.md and tested
  (`App.test.tsx#shows each hit by rank, not as a misleading percentage`).

Deliberate exclusions, as in the proposal: no light theme, no mobile layout below 1024 px, and no
changes to oms-ui or to the API.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contracts |
| P-02 | Specification before code, generated models only | N/A | No API or message models; the REST types are unchanged |
| P-03 | Never edit generated code | PASS | No generated code touched |
| P-04 | Contracts evolve compatibly | N/A | No contract changes |
| P-05 | Every state change is recorded in the event log | N/A | No order state |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | PASS | Each search carries a request number. A stale answer is ignored, including after `clear` or an empty submit, which now cancel an in-flight search (tested) |
| P-09 | Commands and queries stay separate | N/A | Read-only UI |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order state |
| P-11 | Layering and conventions | PASS | Pure logic in `src/okf/` (as before), the theme in `src/theme/` (as oms-ui), components in `src/components/` |
| P-12 | Jackson 3 only | N/A | TypeScript |
| P-13 | Errors and validation follow the framework specs | PASS | API failures are shown inline with the reason (`role=alert`), not only logged to the console as before |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC maps to passing tests, and the tests run inside the module's verify command. The first review found AC-9 untested and three proxy assertions, both now fixed. Regression tests for existing behaviour (T-14) passed on first run by nature; the replaced proxy assertion was mutation-checked |
| P-15 | Observability | N/A | Browser dev tool with no server-side flow; errors are now visible to the user |
| P-16 | Security | PASS | No secrets and no new network calls. Mermaid's default `securityLevel` is unchanged. New dev dependencies: vitest moved to **5.1.0** because 3.2.x carried two critical advisories (`tinypool` RCE, `@vitest/mocker` path traversal). No critical or high `npm audit` finding remains; the 9 low and moderate ones predate this ticket |
| P-17 | Simplicity and dependencies | PASS | Dev-only `vitest`, `@testing-library/react`, `@testing-library/dom` and `jsdom`, justified in D3 with the version change recorded. No runtime dependency added; `App.css` deleted |
| P-18 | Modules build standalone | PASS | **Note:** the explorer builds without oms-ui being built. But `npm run build` now runs `tokens.test.ts`, which **reads** `oms-ui/frontend/src/theme/_tokens.scss`, so the build needs the monorepo checkout. There is no Dockerfile or CI job for the explorer today. Acceptable, and stated here deliberately |
| P-19 | Documentation follows behaviour | PASS | `tools/kb-explorer.md` (look, search, ranks, keyboard, tests) and `ui/design-system.md` (Other apps, copy the tokens) updated; the module README updated too. `okf-check` reports 0 errors; its 1 warning is about `architecture/context/oms-ui.md` drifting from an unrelated oms-ui commit |

## Independent Review

**First pass** (spec-reviewer): **NOT MET**.
- AC-1, AC-3, AC-4, AC-5 and AC-6 proven.
- AC-2, AC-7 and AC-8 weak.
- **AC-9 not proven:** no test for Back/Forward (whose handler this diff changed), `#anchor` links,
  the TOC, the links panel, or the tree's view toggle and filters.

All findings were fixed in T-14 to T-18:
1. **[major] AC-9 untested.** Six regression tests added (see AC-9 above).
2. **[major] Scanner blind spots** (`://` lines, named colours, `oklch` and friends, arbitrary
   values, palette class before `${`, `fontSize=`, `font:` shorthand, `letterSpacing`, removed
   Tailwind sizes). The scanner was rewritten as 9 rules, each with a self-test using the reviewer's
   probes. A bug in my own `font-size` pattern, a backtracking `\s*` before a negative lookahead,
   was caught by its self-test.
3. **[minor] Logo SVG literals passed by blind spot.** They are now an explicit, reasoned
   allow-list entry, tested as still needed.
4. **[minor] Proxy assertions.** Replaced: default-prevented `/` (mutation-checked), the document
   view after Esc, and one status with no overlay plus the tree used during a search.
5. **[minor] `clear` didn't cancel an in-flight search.** It now bumps `request`, with a test.
6. **[minor] Stale README.** Updated.
7. **[minor] `passWithNoTests`.** Removed.
8. **[minor] Rank display is added scope.** Called out in the Goal Assessment.
9. **[minor] Launcher error reporting.** Added.

**Second pass on the delta:** **MET**, with every AC proven, P-14 satisfied and no blocking or
major findings. It raised two minor, informational points:
- **The allow-list entry waived every rule on the logo's line,** so a named `fill` there would have
  passed unnoticed. Fixed: entries now name the rules they waive (font size, letter spacing). A test
  shows the named-colour rule still applies to that line, and that every waived rule name exists.
- **The trust filter has no component test.** Accepted: its logic is covered by
  `sidebar.test.ts#filters by status and trust`, and the component path is the same `FilterChip`
  the status-filter test exercises.

## Automated Evidence

`evidence/last-run.json`: ran 2026-11-16T11:27:33Z, result **pass**, fingerprint `c39c9b2c50423a75`.
- **Modules:** oms-kb-explorer, oms-knowledge-base.
- **Policy check** (changes since main, merge-base 199c36e3): PASS.
- **`npm run build`** (oms-kb-explorer): exit 0, `evidence/oms-kb-explorer-1.log`. It runs
  `node --test` (67 passed, 0 failed), Vitest (16 passed), `tsc -b` and `vite build`.
- **`okf-check`**: 0 errors.

## Follow-ups

- **The developer cockpit still uses vitest 3.2.7,** which carries the same two critical advisories.
  Upgrade it to 5.1.0.
- **Document load errors take a few seconds to appear,** because of TanStack Query's 3 default
  retries. Use `retry: 1` for document reads, or no retries on 404.
- **Remaining `npm audit` findings** in the explorer: eslint's `minimatch` and mermaid's `katex`,
  low and moderate, pre-existing.
- **The knowledge server's CORS list allows only `localhost:5173`–`5177`.** A dev server on another
  port fails silently, showing loading skeletons that resolve to errors after the retries. A clearer
  hint in the explorer's README or error message would help.
- **Light theme, for both apps together.** Out of scope here.
- **`architecture/context/oms-ui.md` is flagged as drifting** by `okf-check`. It is unrelated to
  this ticket; another session changed `oms-ui/frontend/src/App.tsx`.

## Verdict

Verdict: GOAL MET
