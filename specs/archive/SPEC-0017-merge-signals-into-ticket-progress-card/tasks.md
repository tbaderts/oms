# Tasks — SPEC-0017: Merge signals into ticket progress card

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

- [x] **T-1** Rename `SignalsPanel.test.tsx` to `Signals.test.tsx` and rewrite it for `YourTurn` and `ActivityBar` (collapsed summary with "2 new" and the newest entry; click expands and collapses; rows keep level labels and new markers; no activity gives a plain row and no button), then add `activityExpanded`/`setActivityExpanded` to `stores/signals.ts` and turn `SignalsPanel.tsx` into `Signals.tsx` with `YourTurn` and `ActivityBar` (AC-2, AC-3, AC-6)
  - files: developer-cockpit/src/renderer/views/dashboard/Signals.tsx, developer-cockpit/src/renderer/views/dashboard/SignalsPanel.tsx, developer-cockpit/src/renderer/stores/signals.ts, developer-cockpit/test/renderer/Signals.test.tsx, developer-cockpit/test/renderer/SignalsPanel.test.tsx
  - verify: `vt test/renderer/Signals.test.tsx test/renderer/signalsStore.test.ts` passes
- [x] **T-2** Update `Dashboard.test.tsx` (one Ticket progress card with donut, your turn and activity, no Signals card; feed checked after expanding; live refresh keeps it expanded; expanded after leaving and returning; load error shows "Signals are unavailable." and no Activity bar), then rework `SpecOverview.tsx` into the full-width card (AC-1, AC-3, AC-4, AC-6)
  - files: developer-cockpit/src/renderer/views/dashboard/SpecOverview.tsx, developer-cockpit/test/renderer/Dashboard.test.tsx
  - verify: `vt test/renderer/Dashboard.test.tsx` passes
- [x] **T-3** Extend `SignalsShell.test.tsx` so the status-bar click also expands Activity and a Dashboard rendered afterwards shows the feed, then set `activityExpanded` in `StatusBar.tsx` (AC-5)
  - files: developer-cockpit/src/renderer/components/layout/StatusBar.tsx, developer-cockpit/test/renderer/SignalsShell.test.tsx
  - verify: `vt test/renderer/SignalsShell.test.tsx` passes and `cd developer-cockpit && npx vitest run` passes
- [x] **T-4** Build and take one-off Playwright screenshots (light and dark, collapsed and expanded, 1440 and 900 px); fix what they show (AC-1, AC-2, AC-3)
  - files: developer-cockpit/src/renderer/views/dashboard/*
  - verify: `cd developer-cockpit && npm run build` passes and the screenshots show the card, the bar and the feed without overlap or clipping
- [x] **T-5** Update `developer-cockpit/spec/03-features.md` §1 and `02-information-architecture.md` for the merged card and the collapsible Activity bar (P-19)
  - files: developer-cockpit/spec/03-features.md, developer-cockpit/spec/02-information-architecture.md
  - verify: the Dashboard rows describe one Ticket progress card with Your turn and the collapsible Activity bar, and no separate Signals card
- [x] **T-6** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0017` exits 0

## Notes

- T-4 needs the app on WebSocket port 9321 for live events (page CSP); the screenshot script is deleted after use.
