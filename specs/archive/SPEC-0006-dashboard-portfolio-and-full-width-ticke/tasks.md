# Tasks — SPEC-0006: Dashboard portfolio and full-width ticket workspace

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

All `npx vitest` commands run from `developer-cockpit/`. Each task writes or moves its tests first and
sees them fail before the change.

- [x] **T-1** Distribution and "mine in progress" data (AC-2, AC-3)
  - files: developer-cockpit/src/renderer/lib/spec-tickets.ts, developer-cockpit/test/renderer/spec-tickets-lib.test.ts
  - verify: `npx vitest run test/renderer/spec-tickets-lib.test.ts` passes
- [x] **T-2** Stage distribution chart with validated stage colours (AC-2)
  - files: developer-cockpit/src/renderer/styles/globals.css, developer-cockpit/src/renderer/views/dashboard/StageDistribution.tsx, developer-cockpit/test/renderer/StageDistribution.test.tsx
  - verify: `npx vitest run test/renderer/StageDistribution.test.tsx` passes
- [x] **T-3** `run()` returns the created id; `openTicket` helper; `NewTicketDialog` `onCreated` (AC-5)
  - files: developer-cockpit/src/renderer/stores/specTickets.ts, developer-cockpit/src/renderer/lib/open-ticket.ts, developer-cockpit/src/renderer/views/spec-tickets/NewTicketDialog.tsx, developer-cockpit/test/renderer/specTickets-store.test.ts
  - verify: `npx vitest run test/renderer/specTickets-store.test.ts test/renderer/NewTicketDialog.test.tsx` passes
- [x] **T-4** Move TicketList to the Dashboard as TicketTable, with its tests (AC-4, AC-5)
  - files: developer-cockpit/src/renderer/views/dashboard/TicketTable.tsx, developer-cockpit/src/renderer/views/spec-tickets/TicketList.tsx (removed), developer-cockpit/test/renderer/TicketTable.test.tsx
  - verify: `npx vitest run test/renderer/TicketTable.test.tsx` passes
- [x] **T-5** Dashboard portfolio: no quick links, chart, completion, Needs me, table, live refresh (AC-1, AC-3, AC-5, AC-9)
  - files: developer-cockpit/src/renderer/views/dashboard/DashboardView.tsx, developer-cockpit/src/renderer/views/dashboard/SpecOverview.tsx, developer-cockpit/test/renderer/Dashboard.test.tsx, developer-cockpit/test/renderer/SpecOverview.test.tsx (merged into Dashboard.test.tsx), developer-cockpit/test/renderer/ContractsView.test.tsx (Dashboard link case removed)
  - verify: `npx vitest run test/renderer/Dashboard.test.tsx test/renderer/ContractsView.test.tsx` passes
- [x] **T-6** Ticket switcher (AC-7)
  - files: developer-cockpit/src/renderer/views/spec-tickets/TicketSwitcher.tsx, developer-cockpit/test/renderer/TicketSwitcher.test.tsx
  - verify: `npx vitest run test/renderer/TicketSwitcher.test.tsx` passes
- [x] **T-7** Spec Tickets workspace: header, empty state, main column + status rail (AC-6, AC-8)
  - files: developer-cockpit/src/renderer/views/spec-tickets/SpecTicketsView.tsx, developer-cockpit/src/renderer/views/spec-tickets/TicketDetail.tsx, developer-cockpit/test/renderer/SpecTicketsView.test.tsx, developer-cockpit/test/renderer/TicketDetail.test.tsx
  - verify: `npx vitest run test/renderer/SpecTicketsView.test.tsx test/renderer/TicketDetail.test.tsx test/renderer/TicketDetail.edit.test.tsx test/renderer/DocumentEditor.guards.test.tsx` passes and `npm run typecheck` passes
- [x] **T-8** Update cockpit spec pages
  - files: developer-cockpit/spec/03-features.md, developer-cockpit/spec/02-information-architecture.md
  - verify: 03-features §1 describes the Dashboard portfolio and the Spec Tickets workspace and no longer describes a list pane in Spec Tickets
- [x] **T-9** Runtime look in the built app (AC-1, AC-2, AC-6)
  - verify: built app over CDP — Dashboard shows chart/legend/Needs me/table without quick links; clicking a row opens Spec Tickets with the ticket in the main column and the status rail; screenshots of both views captured and inspected for overlap or clipping
- [x] **T-10** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0006` exits 0

### Review fixes (ticket reopened at implement)

- [x] **T-11** Round chart percentages once; drop the dead `perStage` (AC-2)
  - files: developer-cockpit/src/renderer/lib/spec-tickets.ts, developer-cockpit/src/renderer/views/dashboard/StageDistribution.tsx, developer-cockpit/test/renderer/spec-tickets-lib.test.ts, developer-cockpit/test/renderer/StageDistribution.test.tsx
  - Tests first: 5 of 11 shows 45% (not 46%) in legend, label and tooltip.
  - verify: `./node_modules/.bin/vitest run test/renderer/spec-tickets-lib.test.ts test/renderer/StageDistribution.test.tsx` passes
- [x] **T-12** Error banner on the Dashboard; `run()` returns the id only when selected (AC-4, AC-5)
  - files: developer-cockpit/src/renderer/views/dashboard/DashboardView.tsx, developer-cockpit/src/renderer/stores/specTickets.ts, developer-cockpit/test/renderer/Dashboard.test.tsx, developer-cockpit/test/renderer/specTickets-store.test.ts
  - Tests first: "shows load errors instead of an empty portfolio"; run returns null when the guard cancels the selection.
  - verify: `./node_modules/.bin/vitest run test/renderer/Dashboard.test.tsx test/renderer/specTickets-store.test.ts` passes
- [x] **T-13** Dashboard table controls covered: stage, module, search, show archived (AC-4)
  - files: developer-cockpit/test/renderer/TicketTable.test.tsx
  - verify: `./node_modules/.bin/vitest run test/renderer/TicketTable.test.tsx` passes
- [x] **T-14** Switcher focus and scrolling: focus back to the trigger on close, active option scrolled into view, close on focus leaving (AC-7)
  - files: developer-cockpit/src/renderer/views/spec-tickets/TicketSwitcher.tsx, developer-cockpit/test/renderer/TicketSwitcher.test.tsx
  - verify: `./node_modules/.bin/vitest run test/renderer/TicketSwitcher.test.tsx` passes
- [x] **T-15** Run spec verify again
  - verify: `node specs/tools/spec.mjs verify SPEC-0006` exits 0
- [x] **T-16** Second review: visible active switcher option in dark mode; popup survives clicks on its padding; action errors survive the following refresh (AC-4, AC-7)
  - files: developer-cockpit/src/renderer/views/spec-tickets/TicketSwitcher.tsx, developer-cockpit/src/renderer/stores/specTickets.ts, developer-cockpit/test/renderer/TicketSwitcher.test.tsx, developer-cockpit/test/renderer/specTickets-store.test.ts, developer-cockpit/test/renderer/Dashboard.test.tsx (test renamed to what it checks)
  - Tests first: "marks the active option with a colour that differs from the popup, and survives clicks on the popup", "keeps an action error visible across the refresh that follows".
  - verify: those tests pass; a dark-theme screenshot of the open switcher shows the active option highlighted; `node specs/tools/spec.mjs verify SPEC-0006` exits 0

## Notes

<!-- Optional: sequencing constraints, tasks added during implementation and why. -->
- TicketList.tsx is deleted in T-7 rather than T-4: SpecTicketsView imports it until its layout changes.
- T-9's screenshots showed task ids wrapping ("T-" / "1") in the narrow status rail; fixed with a non-wrapping id and re-checked (second screenshot). The first T-9 attempt was blocked by the user's running cockpit holding port 9321.
- T-11..T-15 were added after the independent review at verify (ticket reopened at implement). T-13 adds coverage for behaviour that already worked (no red phase).
