# Tasks — SPEC-0015: Add donut chart and KPI tiles to dashboard

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

All paths are relative to the repository root. `vt <file>` means `cd developer-cockpit && npx vitest run <file>`.

- [x] **T-1** Write `test/renderer/stageColors.test.ts` (parse the `--stage-*` tokens of `:root` and `.dark` from `globals.css`; OKLab and Machado 2009 colour-vision simulation; neighbouring pairs in donut order plus the wrap pair; ΔE thresholds 8 and 15; chroma ≥ 0.1; 7 distinct colours), see it fail on today's blue ramp, then set the validated palette in `globals.css` (AC-2)
  - files: developer-cockpit/test/renderer/stageColors.test.ts, developer-cockpit/src/renderer/styles/globals.css
  - verify: `vt test/renderer/stageColors.test.ts` passes
- [x] **T-2** Write the `kpis()` cases in `test/renderer/spec-tickets-kpis.test.ts` (active, in progress, awaiting, blocked, done and completion over non-archived tickets; empty list gives zeros and null completion), then implement `kpis()` in `lib/spec-tickets.ts` (AC-3, AC-6)
  - files: developer-cockpit/src/renderer/lib/spec-tickets.ts, developer-cockpit/test/renderer/spec-tickets-kpis.test.ts
  - verify: `vt test/renderer/spec-tickets-kpis.test.ts` passes
- [x] **T-3** Write `test/renderer/StageDonut.test.tsx` (segments in pipeline order with proportional arcs, centre total, archived excluded, text alternative; a legend label with name and count for every segment, blocked with an icon; hover and focus tooltip; Enter and Space toggle the filter; a single stage drawn as a full ring; empty state), then implement `StageDonut.tsx` and delete `StageDistribution.tsx` and its test (AC-1, AC-2, AC-5, AC-6)
  - files: developer-cockpit/src/renderer/views/dashboard/StageDonut.tsx, developer-cockpit/test/renderer/StageDonut.test.tsx, developer-cockpit/src/renderer/views/dashboard/StageDistribution.tsx, developer-cockpit/test/renderer/StageDistribution.test.tsx
  - verify: `vt test/renderer/StageDonut.test.tsx` passes
- [x] **T-4** Extend `test/renderer/Dashboard.test.tsx` (KPI tile values and accents; filtering from a donut segment, a legend entry and the Blocked and Done tiles, with the chip and Clear; empty portfolio; live refresh updating donut, legend and tiles; load error), then implement `KpiTiles.tsx`, rework `SpecOverview.tsx` and add the stage dot in `TicketTable.tsx` (AC-3, AC-4, AC-6, AC-7)
  - files: developer-cockpit/src/renderer/views/dashboard/KpiTiles.tsx, developer-cockpit/src/renderer/views/dashboard/SpecOverview.tsx, developer-cockpit/src/renderer/views/dashboard/TicketTable.tsx, developer-cockpit/test/renderer/Dashboard.test.tsx
  - verify: `vt test/renderer/Dashboard.test.tsx` passes
- [x] **T-5** Build the app and look at the Dashboard in light and dark themes with a Playwright screenshot of the real app (labels, overlap, colours, tooltip); fix what the screenshot shows (AC-1, AC-3)
  - files: developer-cockpit/src/renderer/views/dashboard/*
  - verify: `cd developer-cockpit && npm run build` passes and the screenshots show the tiles, donut, legend and table without overlap or clipping
- [x] **T-6** Update `developer-cockpit/spec/03-features.md` §1 Dashboard (overview row, donut, colours, filtering) (P-19)
  - files: developer-cockpit/spec/03-features.md
  - verify: the section names the KPI tiles, the donut and its filtering, and no longer mentions the stacked bar
- [x] **T-7** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0015` exits 0

## Notes

- T-5 is a visual check because the dataviz method says a validator checks colour, not layout:
  the screenshot is how label collisions and overflow are caught. The screenshot script is a
  one-off in the scratchpad, not a committed e2e test.
