# Tasks — SPEC-0060: Finish design tokens and trim AG Grid modules

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

All paths below are under `oms-ui/frontend/`; verify commands run from the repository root. `J` stands for `cd oms-ui/frontend && CI=true npx react-app-rewired test --watchAll=false`.

- [x] **T-1** Add `scripts/bundle-size.js` (gzipped size of `build/static/js/main.*.js`) and record the baseline before any code change (AC-7)
  - files: oms-ui/frontend/scripts/bundle-size.js
  - verify: `cd oms-ui/frontend && npm run build && node scripts/bundle-size.js` prints a size, recorded under Notes as the baseline
- [x] **T-2** Write `theme/agGridTheme.test.ts`, then add `fontSizeSm`/`fontSizeXs` to `theme/tokens.ts` and use them in `theme/agGridTheme.ts` (AC-1)
  - files: oms-ui/frontend/src/theme/tokens.ts, oms-ui/frontend/src/theme/agGridTheme.ts, oms-ui/frontend/src/theme/agGridTheme.test.ts
  - verify: `J src/theme/agGridTheme.test.ts src/theme/styleRules.test.ts` passes
- [x] **T-3** Write the TS/TSX source rules and their fixture test in `theme/styleRules.test.ts` (red on the AcmeLogo literals) (AC-3)
  - files: oms-ui/frontend/src/theme/styleRules.test.ts
  - verify: `J src/theme/styleRules.test.ts` reports the AcmeLogo literals (and any other existing offender), and the fixture test passes
- [x] **T-4** Write `components/AcmeLogo.test.tsx`, then default the logo to `currentColor` and draw the line with `omsTokens.accent`; fix any other offender T-3 found with a token (AC-2, AC-3)
  - files: oms-ui/frontend/src/components/AcmeLogo.tsx, oms-ui/frontend/src/components/AcmeLogo.test.tsx
  - verify: `J src/components/AcmeLogo.test.tsx src/theme/styleRules.test.ts` passes
- [x] **T-5** Add the boolean-filter test to `services/ColumnConfigService.test.ts`, then make booleans a text filter on Yes/No (valueFormatter + filterValueGetter) (AC-6)
  - files: oms-ui/frontend/src/services/ColumnConfigService.ts, oms-ui/frontend/src/services/ColumnConfigService.test.ts
  - verify: `J src/services/ColumnConfigService.test.ts` passes
- [x] **T-6** Move the two default column definitions into `theme/gridOptions.ts` and use them in both blotters, with no behaviour change (AC-5)
  - files: oms-ui/frontend/src/theme/gridOptions.ts, oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.tsx
  - verify: `J src/components/Blotter.test.tsx src/components/StreamingBlotter.test.tsx` passes
- [x] **T-7** Write `theme/gridModules.test.ts` (history, live, leave-one-out, no AllCommunityModule), then add `theme/gridModules.ts` with the proven module list and register it (plus ValidationModule outside production) in `theme/agGridModules.ts` (AC-4, AC-5)
  - files: oms-ui/frontend/src/theme/gridModules.ts, oms-ui/frontend/src/theme/gridModules.test.ts, oms-ui/frontend/src/theme/agGridModules.ts
  - verify: `J src/theme/gridModules.test.ts` passes
- [x] **T-8** Write `DetailPanel.test.tsx#shows the same price, quantity and time text as the grid`, and fix any divergence in `DetailPanel` (AC-8)
  - files: oms-ui/frontend/src/components/DetailPanel.test.tsx, oms-ui/frontend/src/components/DetailPanel.tsx
  - verify: `J src/components/DetailPanel.test.tsx` passes
- [x] **T-9** Rebuild and measure the bundle; it must be smaller than the T-1 baseline (AC-7)
  - files: oms-ui/frontend/scripts/bundle-size.js
  - verify: `cd oms-ui/frontend && npm run build && node scripts/bundle-size.js` prints a size below the baseline, recorded under Notes
- [x] **T-10** Update the knowledge base: `ui/design-system.md`, `ui/admin-ui.md` (boolean filter), `log.md` (AC-9)
  - files: oms-knowledge-base/ui/design-system.md, oms-knowledge-base/ui/admin-ui.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors
- [x] **T-11** Run the full verification (AC-9)
  - files: none
  - verify: `node specs/tools/spec.mjs verify SPEC-0060` passes

## Notes

- **Baseline (T-1, before any code change):** `main.bdaeeb33.js`: 1547.7 kB raw, **429.5 kB gzipped**
  (zlib level 9).
- **After (T-9):** `main.09f2718a.js`: 1285.6 kB raw, **360.4 kB gzipped**: 69.1 kB (16 %) smaller.
  - The production bundle holds no ValidationModule. The only "ValidationModule" text is AG Grid
    core's hint "Alternatively register the ValidationModule…".
  - The build's one warning (react-hooks/exhaustive-deps in StreamingBlotter) predates this ticket.
- **T-8:** the parity test was green on its first run. The detail panel already used the grid's
  formatters since SPEC-0059, so there was no divergence to fix; the test now guards it.
- T-1 runs before any code change, so the baseline is the pre-change bundle.
- T-6 precedes T-7, so the module test imports the blotters' real default column definitions.
