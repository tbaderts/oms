# Verification — SPEC-0060: Finish design tokens and trim AG Grid modules

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify` (evidence/oms-ui-1.log: 34 suites, 229
tests). Test files are under `oms-ui/frontend/src/`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Grid font sizes from the type-scale tokens; the mirror test guards them | `theme/agGridTheme.test.ts#takes its font sizes from the type-scale tokens`: the theme uses `omsTokens.fontSizeSm`/`fontSizeXs`, with no literal. `theme/styleRules.test.ts#tokens.ts mirrors _tokens.scss` compares them with `--oms-font-size-sm`/`-xs` | PASS |
| AC-2 | Logo has no colour literal; it defaults to `currentColor` and the line uses the accent | `components/AcmeLogo.test.tsx#defaults to currentColor and draws the line in the accent token`, `#uses a given colour…`; `styleRules.test.ts#uses no colour literals in TS/TSX sources` scans `AcmeLogo.tsx` | PASS |
| AC-3 | TS/TSX scan: no colour literal in styles or SVG colour attributes, no literal `fontSize`; a fixture proves each kind is detected | `styleRules.test.ts#uses no colour literals in TS/TSX sources`, `#uses no literal font sizes in inline styles`, `#the source rules detect each kind of literal`. The fixture has 24 literals that must be found and 13 allowed forms that must not; it includes every miss the reviewer reported | PASS |
| AC-4 | Named modules registered, not `AllCommunityModule` | `theme/gridModules.test.tsx#registers named modules, not AllCommunityModule` | PASS |
| AC-5 | Real AG Grid with only the registered modules, for both blotters, logs no #200; removing a module fails | `gridModules.test.tsx#the history configuration…` and `#the live configuration…`, for Order and Execution (number, date, enum, boolean, object and id columns; filters, sort, transactions, flash, sizing; any exception fails). `#every listed module is needed` leaves out each module in turn and expects a failure | PASS |
| AC-6 | Boolean columns use a Community filter | `services/ColumnConfigService.test.ts#boolean columns use a Community text filter on Yes/No`, `#no column asks for an Enterprise filter` | PASS |
| AC-7 | Gzipped main bundle smaller than before; both numbers recorded | `scripts/bundle-size.js`: before, `main.bdaeeb33.js`: 1547.7 kB raw, **429.5 kB** gzipped; after, `main.09f2718a.js`: 1285.6 kB raw, **360.4 kB** gzipped, 69.1 kB (16 %) smaller. The reviewer re-measured 360.4 kB. ValidationModule is absent from the production bundle | PASS |
| AC-8 | Detail panel shows the same price, quantity and time text as the grid | `components/DetailPanel.gridParity.test.tsx#shows the same price, quantity and time text as the grid` | PASS |
| AC-9 | oms-ui verify passes, existing tests included | evidence/oms-ui-1.log (`npm test`: 34 suites, 229 tests), evidence/oms-ui-2.log (`gradlew check`: BUILD SUCCESSFUL) | PASS |

## Goal Assessment

Each of the five goal items is delivered:
1. **Grid font sizes.** They come from the type-scale tokens through the `tokens.ts` mirror.
2. **Logo colours.** They come from tokens: `currentColor` and the accent. No brand exception was
   needed, because `--oms-accent` is the logo green.
3. **Style scan.** It covers the TS/TSX sources:
   - colour literals anywhere in strings;
   - literal colours, named colours included, in colour-valued style properties and SVG colour
     attributes, whether quoted, in expressions or in conditionals;
   - literal font sizes.

   Fixture tests show that each kind of literal is caught.
4. **AG Grid modules.** `AllCommunityModule` became 8 named modules. A real-grid test fails on
   #200, on an exception, or on a filter or sort that does nothing. Leaving out each module in turn
   proves every one is needed. The bundle is 69 kB smaller gzipped. Development builds keep
   ValidationModule, so a missing module shows in the console.
5. **Detail formatting.** The detail modal already used the grid's formatters since SPEC-0059. A
   test now keeps the two the same.

The checks also found two things the goal did not name:
- the boolean columns' Enterprise-only set filter, which never worked, is now the text filter;
- `CellStyleModule` is needed by the right-aligned number columns, while `ClientSideRowModelModule`
  is always included by AG Grid's core.

Left out on purpose:
- SVG geometry font sizes (`fontSize="42"` in viewBox units);
- the grid's spacing, radius and row-height literals (no tokens exist for them);
- bundle work beyond the grid modules.

A requester would agree the goal is met.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract files |
| P-02 | Specification before code, generated models only | N/A | UI only, no models |
| P-03 | Never edit generated code | PASS | None touched |
| P-04 | Contracts evolve compatibly | N/A | No contract change |
| P-05 | Every state change is recorded in the event log | N/A | Display only |
| P-06 | Kafka only through the transactional outbox | N/A | No messaging |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema |
| P-08 | Concurrency and idempotency are explicit | N/A | No commands |
| P-09 | Commands and queries stay separate | N/A | Read-only UI |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transitions |
| P-11 | Layering and conventions | PASS | Theme and grid setup in `theme/`, formatting in `services/`, components in `components/`, a build script in `scripts/` |
| P-12 | Jackson 3 only | N/A | No Java |
| P-13 | Errors and validation follow the framework specs | N/A | No API errors |
| P-14 | Test first, every AC proven by an automated test | PASS | Each AC traces to named tests, written red first (the logo, theme, boolean and module tests failed before the change). AC-8's parity test was green at once, because SPEC-0059 had already aligned the formatters; it now guards them. AC-7 is a scripted measurement |
| P-15 | Observability | N/A | No server behaviour |
| P-16 | Security | PASS | No new inputs; fewer shipped modules |
| P-17 | Simplicity and dependencies | PASS | No new dependency; the bundle script uses Node's `zlib`; shared default column definitions remove a duplicate |
| P-18 | Modules build standalone | PASS | oms-ui verify passes on its own |
| P-19 | Documentation follows behaviour | PASS | `ui/design-system.md` (tokens in the grid and logo, the TS/TSX rules, the modules and their check), `ui/admin-ui.md` (boolean filters), `log.md`; okf-check 0 errors |

## Independent Review

The spec-reviewer ran twice.

**First pass: NOT MET.**

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | blocking | The TS/TSX rule missed named colours in inline styles, which the proposal includes. It also missed single-quoted or spaced SVG attributes, conditionals, upper-case `RGB()`, `//` inside strings and JSX apostrophes | A string-aware scanner, `namedColourValues` for colour-valued style properties and SVG attributes, and case-insensitive colour functions; every miss is now a fixture case |
| 2 | major | The module test used only one synthetic Execution metamodel | It now runs Order and Execution configurations, with an `object` field |
| 3 | minor | Non-#200 exceptions were swallowed, so a run could pass without proving anything | Positive runs assert `{ missing: [], failures: [] }` |
| 4 | minor | The design-system page overstated the rule | Corrected |
| 5 | process | verification.md was not written | This document |

**Second pass: MET.** It reported three minor items:
1. A few remaining forms were not caught: `backgroundImage`, logical border properties, quoted
   keys, `el.style.backgroundColor =` and the `font:` shorthand. All are now caught and are
   fixture cases. The `=` form for font sizes is limited to `style.fontSize = …`, so SVG geometry
   stays out of scope.
2. The leave-one-out test counts any failure as "needed". This was kept as it is: it is sound
   because the full list must run clean in the positive tests, and the test's comment says so.
3. verification.md: this document.

The fixes ran in the final `spec verify` below.

## Automated Evidence

`evidence/last-run.json`: ran 2026-11-15T16:24:57Z, result **pass**, fingerprint `9e9c7ffd8d9630cd`,
module oms-ui.

| Command | Exit | Log |
|---|---|---|
| `npm test -- --watchAll=false --passWithNoTests` (34 suites, 229 tests) | 0 | evidence/oms-ui-1.log |
| `..\gradlew.bat -p .. check` | 0 | evidence/oms-ui-2.log |
| `npm run build && node scripts/bundle-size.js`, before and after (AC-7) | 0 | numbers in tasks.md Notes and AC-7 above |

Policy check (changes since main, merge-base 03bc12da): PASS.

## Follow-ups

- Spacing, radius and row-height literals in `agGridTheme.ts` would need spacing and shape tokens
  mirrored to TS. That is out of scope here.
- The pre-existing `react-hooks/exhaustive-deps` build warning in `StreamingBlotter.tsx`.
- The working tree also holds other sessions' and tickets' changes (SPEC-0059, SPEC-0061,
  developer-cockpit, SPEC-0054/0062). Stage SPEC-0060's files explicitly when committing.

## Verdict

Verdict: GOAL MET
