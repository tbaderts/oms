# Tasks — SPEC-0059: Improve trader ergonomics in oms-ui blotters

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

All verify commands run from the repository root; `T` below means `cd oms-ui/frontend && npx react-app-rewired test --watchAll=false`.

- [x] **T-1** Write `services/fieldFormat.test.ts` (prices, quantities, FIX ExecType labels, field classifiers), then implement `services/fieldFormat.ts` (AC-2, AC-3)
  - files: oms-ui/frontend/src/services/fieldFormat.ts, oms-ui/frontend/src/services/fieldFormat.test.ts
  - verify: `cd oms-ui/frontend && npx react-app-rewired test --watchAll=false src/services/fieldFormat.test.ts` passes
- [x] **T-2** Write `components/IdCell.test.tsx`, then implement `IdCell.tsx` + `IdCell.scss` (start-truncation, title tooltip) (AC-4)
  - files: oms-ui/frontend/src/components/IdCell.tsx, oms-ui/frontend/src/components/IdCell.scss, oms-ui/frontend/src/components/IdCell.test.tsx
  - verify: `cd oms-ui/frontend && npx react-app-rewired test --watchAll=false src/components/IdCell.test.tsx` passes
- [x] **T-3** Write `services/ColumnConfigService.test.ts` (right alignment, price/quantity formatters, execType label, ID width and renderer), then change `ColumnConfigService.createColumnDef` (AC-1, AC-2, AC-3, AC-4)
  - files: oms-ui/frontend/src/services/ColumnConfigService.ts, oms-ui/frontend/src/services/ColumnConfigService.test.ts
  - verify: `cd oms-ui/frontend && npx react-app-rewired test --watchAll=false src/services/ColumnConfigService.test.ts` passes
- [x] **T-4** Add `DetailPanel.test.tsx#shows the exec type label` and formatter expectations, then switch `DetailPanel.formatValue` to the shared formatters (AC-2, AC-3)
  - files: oms-ui/frontend/src/components/DetailPanel.tsx, oms-ui/frontend/src/components/DetailPanel.test.tsx
  - verify: `cd oms-ui/frontend && npx react-app-rewired test --watchAll=false src/components/DetailPanel.test.tsx` passes
- [x] **T-5** Write `hooks/useKeyboard.test.tsx` for `useEscape` and `useShortcuts` (modifiers, inputs, open modal, disabled), then implement `hooks/useKeyboard.ts` (AC-6, AC-7)
  - files: oms-ui/frontend/src/hooks/useKeyboard.ts, oms-ui/frontend/src/hooks/useKeyboard.test.tsx
  - verify: `cd oms-ui/frontend && npx react-app-rewired test --watchAll=false src/hooks/useKeyboard.test.tsx` passes
- [x] **T-6** Add Escape tests to `DetailModal.test.tsx`, new `FilterBuilder.test.tsx` and `ColumnSelector.test.tsx`, then call `useEscape` in the three dialogs (AC-6)
  - files: oms-ui/frontend/src/components/DetailModal.tsx, oms-ui/frontend/src/components/FilterBuilder.tsx, oms-ui/frontend/src/components/ColumnSelector.tsx, oms-ui/frontend/src/components/DetailModal.test.tsx, oms-ui/frontend/src/components/FilterBuilder.test.tsx, oms-ui/frontend/src/components/ColumnSelector.test.tsx
  - verify: `cd oms-ui/frontend && npx react-app-rewired test --watchAll=false src/components/DetailModal.test.tsx src/components/FilterBuilder.test.tsx src/components/ColumnSelector.test.tsx` passes
- [x] **T-7** Write `components/BlotterToolbar.test.tsx`, then implement `BlotterToolbar.tsx` (shared left side and buttons, `status` and `actions` slots, shortcut hints in titles) (AC-9)
  - files: oms-ui/frontend/src/components/BlotterToolbar.tsx, oms-ui/frontend/src/components/BlotterToolbar.test.tsx
  - verify: `cd oms-ui/frontend && npx react-app-rewired test --watchAll=false src/components/BlotterToolbar.test.tsx` passes
- [x] **T-8** History blotter: add tests for newest-first executions, kept order request, shortcuts F/C/R, Enter on a row and the shared toolbar; then use `BlotterToolbar`, `useShortcuts`, `onCellKeyDown` and the default sort in `Blotter.tsx` (AC-5, AC-7, AC-9)
  - files: oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/components/Blotter.test.tsx
  - verify: `cd oms-ui/frontend && npx react-app-rewired test --watchAll=false src/components/Blotter.test.tsx` passes
- [x] **T-9** Live blotter: add tests for P, Enter, shortcuts ignored in inputs and in an inactive blotter, and the shared toolbar; then use `BlotterToolbar`, `useShortcuts` and `onCellKeyDown` in `StreamingBlotter.tsx` (AC-7, AC-9)
  - files: oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx
  - verify: `cd oms-ui/frontend && npx react-app-rewired test --watchAll=false src/components/StreamingBlotter.test.tsx` passes
- [x] **T-10** Add `App.test.js#mode toggle reads Live and History`, then relabel the toggle (Live first, `aria-pressed`) and update tests that assert the old labels (AC-8)
  - files: oms-ui/frontend/src/App.tsx, oms-ui/frontend/src/App.test.js
  - verify: `cd oms-ui/frontend && npx react-app-rewired test --watchAll=false src/App.test.js` passes
- [x] **T-11** Update the knowledge base: `ui/admin-ui.md` (Formatting and keyboard), `capabilities/admin-ui.md`, `log.md` (P-19)
  - files: oms-knowledge-base/ui/admin-ui.md, oms-knowledge-base/capabilities/admin-ui.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` exits 0 and `node tools/okf-check/check-kb-refs.mjs` exits 0
- [x] **T-14** Resolve the spec-reviewer findings: assert the start-truncation CSS of IdCell (AC-4); treat only text-like inputs as typing, and test a text input at blotter level (AC-7); ignore dialogs that are not visible; dialogs get role="dialog", aria-modal, focus on open and focus restored on close, and AuthorizeModal closes on Escape (AC-6); aria-keyshortcuts on shortcut buttons; strikePrice is a price everywhere (AC-2); update the toolbar diagram in ui/admin-ui.md
  - files: oms-ui/frontend/src/components/IdCell.test.tsx, oms-ui/frontend/src/hooks/useKeyboard.ts, oms-ui/frontend/src/hooks/useKeyboard.test.tsx, oms-ui/frontend/src/components/*.tsx, oms-ui/frontend/src/services/fieldFormat.ts, oms-ui/frontend/src/services/fieldFormat.test.ts, oms-knowledge-base/ui/admin-ui.md
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false` passes
- [x] **T-12** Run the full oms-ui verify (AC-10)
  - files: none
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false --passWithNoTests` and `cd oms-ui && ./gradlew check` pass
- [x] **T-13** Run spec verify (AC-10)
  - files: none
  - verify: `node specs/tools/spec.mjs verify SPEC-0059` exits 0

## Notes

- Commits only when the maintainer asks (`git.commitPerTask: false`).
