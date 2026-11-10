# Tasks — SPEC-0058: Give oms-ui a professional visual design

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

No contract or migration tasks (design → Contract Changes, Data & Persistence).

### oms-core

- [x] **T-1** Add `MetamodelService.formatEnumLabel` (words, Title case, acronym set) and use it for enum labels; write `MetamodelServiceTest#enumLabelsAreWords` first (AC-3)
  - files: oms-core/src/main/java/org/example/oms/service/MetamodelService.java, oms-core/src/test/java/org/example/oms/service/MetamodelServiceTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.MetamodelServiceTest'` passes

### oms-ui: rules first (red until the restyle is done)

- [x] **T-2** Write `theme/styleRules.test.ts` (no colour or font-size literals outside `_tokens.scss`, `tokens.ts` mirrors `_tokens.scss`, badges not uppercased or letter-spaced, footer on the surface colour, every stylesheet imported, no dead class rules) and `theme/contrast.test.ts` (WCAG ratios from the tokens, no VS Code value); see them fail on today's styles (AC-1, AC-2, AC-4, AC-6, AC-7)
  - files: oms-ui/frontend/src/theme/styleRules.test.ts, oms-ui/frontend/src/theme/contrast.test.ts
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/theme` runs and reports the expected failures (recorded under Notes)
- [x] **T-3** New palette, type scale, spacing, radius and elevation in `_tokens.scss`; `tokens.ts` mirror; `agGridTheme.ts` from the tokens (`colorSchemeDark`) (AC-1, AC-2)
  - files: oms-ui/frontend/src/theme/_tokens.scss, oms-ui/frontend/src/theme/tokens.ts, oms-ui/frontend/src/theme/agGridTheme.ts
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/theme/contrast.test.ts` passes, and the mirror test in styleRules passes

### oms-ui: icons and components

- [x] **T-4** Add the `Icon` component (about 20 inline SVG glyphs); write `components/icons/Icon.test.tsx` first (renders an aria-hidden svg per name, unknown names are a type error) (AC-5)
  - files: oms-ui/frontend/src/components/icons/Icon.tsx, oms-ui/frontend/src/components/icons/Icon.test.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/components/icons` passes
- [x] **T-5** Detail modal: section icons instead of abbreviations, title "<Order|Execution> details"; write the DetailPanel and DetailModal tests first (AC-5)
  - files: oms-ui/frontend/src/components/DetailPanel.tsx, oms-ui/frontend/src/components/DetailPanel.test.tsx, oms-ui/frontend/src/components/DetailModal.tsx, oms-ui/frontend/src/components/DetailModal.test.tsx, oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/components/Detail` passes
- [x] **T-6** Badges: `EnumCellRenderer` shows the label as given, `EnumCellRenderer.scss` on tone tokens without uppercase or letter spacing; write `EnumCellRenderer.test.tsx` first (AC-4)
  - files: oms-ui/frontend/src/components/EnumCellRenderer.tsx, oms-ui/frontend/src/components/EnumCellRenderer.scss, oms-ui/frontend/src/components/EnumCellRenderer.test.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/components/EnumCellRenderer` passes and the badge rule in styleRules passes
- [x] **T-7** Header and footer: header bar, segmented mode switch, Authorize as primary with icon, tabs; footer on the surface with the current year; write `App.footer.test.tsx` first (AC-6)
  - files: oms-ui/frontend/src/App.tsx, oms-ui/frontend/src/App.scss, oms-ui/frontend/src/App.footer.test.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/App` passes and the footer rule in styleRules passes
- [x] **T-8** Toolbars, controls and grid sizing: toolbar icons, "Rows per page" selector, shared input, select and checkbox styles, `autoSizeStrategy` fitGridWidth and `onGridSizeChanged` in both blotters (no autoSize on grid ready) (AC-8)
  - files: oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/Blotter.scss, oms-ui/frontend/src/components/Blotter.test.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/components/Blotter.test.tsx src/components/StreamingBlotter.test.tsx` passes

### oms-ui: every stylesheet on tokens

- [x] **T-9** Rewrite `Blotter.scss` and `EnumCellRenderer.scss` on tokens (AC-1)
  - files: oms-ui/frontend/src/components/Blotter.scss
  - verify: styleRules reports no literal in these files
- [x] **T-10** Rewrite `FilterBuilder.scss`, `ColumnSelector.scss`, `DetailModal.scss`, `DetailPanel.scss`, `AuthorizeModal.scss` on tokens, with the shared modal look (AC-1)
  - files: oms-ui/frontend/src/components/FilterBuilder.scss, oms-ui/frontend/src/components/ColumnSelector.scss, oms-ui/frontend/src/components/DetailModal.scss, oms-ui/frontend/src/components/DetailPanel.scss, oms-ui/frontend/src/components/AuthorizeModal.scss
  - verify: styleRules reports no literal in these files
- [x] **T-11** Rewrite `App.scss` and `index.css` on tokens, delete `App.css`, remove dead rules the scan reports (AC-1, AC-7)
  - files: oms-ui/frontend/src/App.scss, oms-ui/frontend/src/index.css, oms-ui/frontend/src/App.css
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false` passes, styleRules and contrast included

### Visual check, knowledge base, verification

- [x] **T-12** Rebuild the oms-ui image (`--no-deps`) and oms-core; capture `screenshots/after` for the seven views at the before window size, and the AC-8 DOM check; ask the requester to review (AC-8, AC-9)
  - files: specs/changes/SPEC-0058-give-oms-ui-a-professional-visual-design/screenshots/after/
  - verify: the seven after screenshots exist, the AC-8 widths match within 2 px and the selector gap is at least 8 px
- [x] **T-13** Knowledge base: the "Visual design" section; update the badge and footer descriptions
  - files: oms-knowledge-base/ui/oms-admin-ui_spec.md
  - verify: grep finds `Visual design`, `_tokens.scss` and `styleRules.test.ts` in the page
- [x] **T-14** Run spec verify (agree a quiet window with other sessions first)
  - verify: `node specs/tools/spec.mjs verify SPEC-0058` exits 0

- [x] **T-15** From the independent review: detail modal badges show metamodel labels through EnumCellRenderer (same tones as the grid, no uppercase); AC-5 title wiring tested through the blotter; remove duplicate imports in MetamodelService; close the style-rule regex gaps (named colours, other colour functions, `font:` shorthand); grid row and header height from the theme only; stale footer line in the KB; test first (AC-1, AC-4, AC-5)
  - files: oms-ui/frontend/src/components/DetailPanel.tsx, oms-ui/frontend/src/components/DetailPanel.scss, oms-ui/frontend/src/components/DetailPanel.test.tsx, oms-ui/frontend/src/components/DetailModal.tsx, oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/Blotter.test.tsx, oms-ui/frontend/src/theme/styleRules.test.ts, oms-core/src/main/java/org/example/oms/service/MetamodelService.java, oms-knowledge-base/ui/oms-admin-ui_spec.md
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false` passes and `cd oms-core && ./gradlew test --tests org.example.oms.service.MetamodelServiceTest` passes
- [x] **T-16** Rerun spec verify after the review fixes, then record AC-8 measurements and evidence in verification.md
  - verify: `node specs/tools/spec.mjs verify SPEC-0058` exits 0

## Notes

- T-2 writes the rule tests before any restyling; they stay red until T-9 to T-11 finish. Each
  restyle task's verify is the part of styleRules for its files.
- T-1 (oms-core) is independent of the oms-ui tasks.
- T-12 replaces running containers on 8080: oms-ui with `--no-deps` (so the streaming service's
  cache survives), and oms-core.
- T-2 red baseline (2026-11-10, today's styles): 9 of 11 checks fail.
  - Fail:
    - muted and badge contrast (the tone tokens do not exist yet);
    - the VS Code values;
    - colour literals and font-size literals;
    - the `tokens.ts` mirror;
    - badge uppercase and letter spacing;
    - the footer on the accent;
    - `App.css` unimported;
    - dead rules: all of `App.css`, `.brand-logo`, `.modal-icon` in three modals, `.toolbar-icon`,
      `.empty-state`, and others.
  - Pass: body text on every surface (4.5:1), and the text on the accent.
- Found during T-12, in the browser, and fixed test first:
  - **The paging grid did not fill the panel** (1,460 of 1,818 px). `Blotter.tsx` built new
    `columnDefs` on every render, which reset the metamodel widths after the fit. It now memoises
    them, and both grids refit on `onNewColumnsLoaded` as well.
  - **The Filter Builder's "Remove" text overflowed its 28 px button.** It is now an icon button,
    named "Remove rule". The three other modals' "×" close glyphs are icon buttons named "Close".
- **The before set covers 4 of the 7 views.** It was taken before any change: live orders, live
  executions, paging orders and the detail modal. The filter builder, column selector and authorise
  modal have after screenshots only.
- Added after the independent review (NOT MET), in the Tasks list as T-15 and T-16.
