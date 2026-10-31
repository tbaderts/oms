# Tasks — SPEC-0016: Replace Needs me with live signals panel

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

- [x] **T-1** Write `listTickets returns the last 20 log entries per ticket` in `test/main/SpecTicketsService.test.ts` (ticket with 25 log entries gets the last 20, oldest first; unreadable ticket.md gives []), then add `recentLog` to `SpecTicketSummary` and `readRecentLog` to `SpecTicketsService` (AC-1)
  - files: developer-cockpit/src/shared/types/specTickets.ts, developer-cockpit/src/main/services/SpecTicketsService.ts, developer-cockpit/test/main/SpecTicketsService.test.ts, developer-cockpit/test/renderer/ticket-fixtures.ts
  - verify: `vt test/main/SpecTicketsService.test.ts` and `vt test/main/SpecTicketsService.perf.test.ts` pass
- [x] **T-2** Write `test/renderer/signals.test.ts` (parseLogEntry incl. "created" and unknown lines; classify for the eight AC-2 texts; collectSignals ordering, cap 20, archived excluded; unknown lines are info with text unchanged), then implement `lib/signals.ts` (AC-1, AC-2, AC-7)
  - files: developer-cockpit/src/renderer/lib/signals.ts, developer-cockpit/test/renderer/signals.test.ts
  - verify: `vt test/renderer/signals.test.ts` passes
- [x] **T-3** Write `test/renderer/signalsStore.test.ts` (first ingest marks nothing new; later entries fresh; only critical/attention go to unseen and toasts, max 3; keys stable when entries leave the window; re-ingest is idempotent; markSeen and dismissToast), then implement `stores/signals.ts` (AC-4, AC-5, AC-6)
  - files: developer-cockpit/src/renderer/stores/signals.ts, developer-cockpit/test/renderer/signalsStore.test.ts
  - verify: `vt test/renderer/signalsStore.test.ts` passes
- [x] **T-4** Write `test/renderer/SignalsPanel.test.tsx` and extend `test/renderer/Dashboard.test.tsx` (signals panel replaces Needs me; level icon and label; your turn order, details, open and empty state; live refresh adds a new entry marked new; load error shows signals unavailable), then implement `SignalsPanel.tsx`, rework `SpecOverview.tsx`, drop `mineInProgress` from `summarize()` and update `spec-tickets-lib.test.ts` (AC-1, AC-2, AC-3, AC-4, AC-7)
  - files: developer-cockpit/src/renderer/views/dashboard/SignalsPanel.tsx, developer-cockpit/src/renderer/views/dashboard/SpecOverview.tsx, developer-cockpit/src/renderer/lib/spec-tickets.ts, developer-cockpit/test/renderer/SignalsPanel.test.tsx, developer-cockpit/test/renderer/Dashboard.test.tsx, developer-cockpit/test/renderer/spec-tickets-lib.test.ts
  - verify: `vt test/renderer/SignalsPanel.test.tsx test/renderer/Dashboard.test.tsx test/renderer/spec-tickets-lib.test.ts` passes
- [x] **T-5** Write `test/renderer/SignalsShell.test.tsx` (status bar count, latest text and click-to-dashboard reset after a live event in another view; nothing at first load; toast with Open for critical/attention, none for good/info), then implement `SignalsWatcher.tsx`, `Toaster.tsx`, the `StatusBar.tsx` indicator, mount both in `App.tsx`, and remove the per-view live refresh from `SpecOverview` and `SpecTicketsView` (AC-5, AC-6)
  - files: developer-cockpit/src/renderer/components/SignalsWatcher.tsx, developer-cockpit/src/renderer/components/Toaster.tsx, developer-cockpit/src/renderer/components/layout/StatusBar.tsx, developer-cockpit/src/renderer/App.tsx, developer-cockpit/src/renderer/views/dashboard/SpecOverview.tsx, developer-cockpit/src/renderer/views/spec-tickets/SpecTicketsView.tsx, developer-cockpit/test/renderer/SignalsShell.test.tsx
  - verify: `vt test/renderer/SignalsShell.test.tsx` passes and `cd developer-cockpit && npx vitest run` passes
- [x] **T-6** Build the app and take one-off Playwright screenshots in light and dark with the Signals panel, a toast and the status-bar indicator (a log entry appended to a scratch workspace while the app runs); fix what the screenshots show (AC-1, AC-5, AC-6)
  - files: developer-cockpit/src/renderer/views/dashboard/*, developer-cockpit/src/renderer/components/*
  - verify: `cd developer-cockpit && npm run build` passes and the screenshots show panel, toast and indicator without overlap or clipping
- [x] **T-7** Update `developer-cockpit/spec/03-features.md` §1 (Signals panel, status-bar indicator, toasts; Needs me removed) and `developer-cockpit/spec/02-information-architecture.md` (P-19)
  - files: developer-cockpit/spec/03-features.md, developer-cockpit/spec/02-information-architecture.md
  - verify: the sections describe the Signals panel, indicator and toasts and no longer mention Needs me or Mine in progress
- [x] **T-8** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0016` exits 0

## Notes

- T-6 is a visual check, as in SPEC-0015: the screenshot script lives in the scratchpad workflow and is deleted after use.
- T-5 changes where the live refresh is mounted; the full vitest run in its verify catches views that relied on their own subscription.
- Changed during implementation:
  - `SignalsWatcher.tsx` was created in T-4, not T-5, because AC-4's "new" marker needs the store to ingest. T-5 mounted it in `App` and removed the per-view live refresh.
  - The Dashboard live-refresh test now renders the watcher, as the app does.
  - The level icon lives in `components/SignalLevelIcon.tsx`, shared by the panel and the toasts, so components do not import from views.
- T-6 screenshots led to a two-line activity row (level, id, "new" and the truncated title on the first line, the event text on the second). The live events needed the app on the default WebSocket port 9321: the page CSP only allows that port, so runs with `COCKPIT_WS_PORT` get no live refresh. This was there before this ticket and is listed as a follow-up.
