# Design — SPEC-0006: Dashboard portfolio and full-width ticket workspace

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

All in `developer-cockpit/src/renderer/` (renderer only; main process, IPC and CLI unchanged):

- `views/dashboard/DashboardView.tsx` — heading, `<SpecOverview/>`, 7 `QUICK_LINKS` cards, a
  Getting Started card.
- `views/dashboard/SpecOverview.tsx` — loads tickets (`useSpecTicketsStore.load`), live refresh
  (`useSpecTicketsLiveRefresh`), per-stage count boxes (`aria-label="Tickets in <stage>"`), task
  completion, `TicketLinks` for *Awaiting approval* / *Blocked*; clicking calls `select(id)` and
  `setActiveView('spec-tickets')`.
- `lib/spec-tickets.ts` — `isMine`, `filterTickets`, `stageIndex`, `summarize` (per-stage counts of
  non-archived tickets, awaiting/blocked mine-first, task totals).
- `views/spec-tickets/SpecTicketsView.tsx` — load + live refresh; 50/50 split: `<TicketList/>`
  (header with title and `NewTicketDialog`, new-ticket `ActionOutput`, filters, table, error rows)
  and `<TicketDetail/>` (stacked: header + `StageProgress`, Goal, gate/next/`TicketActions`,
  `Traceability` + `Evidence` grid, document tabs with the SPEC-0004 editor, log).
- `stores/specTickets.ts` — `run(action)` selects a newly created ticket (`Created SPEC-NNNN`) but
  returns nothing; `select` has the SPEC-0004 unsaved-edit guard; `stores/navigation.ts`
  `setActiveView` has the same guard.
- `views/spec-tickets/NewTicketDialog.tsx` — `await run({ kind: 'new', … })`.
- Theme: `stores/config.ts` toggles `.light`/`.dark` on `<html>`; tokens in `styles/globals.css`
  (`:root`, `.dark`).
- Tests: `test/renderer/SpecOverview.test.tsx`, `SpecTicketsView.test.tsx`, `TicketDetail*.test.tsx`,
  `DocumentEditor.guards.test.tsx`, `specTickets-store.test.ts`, `spec-tickets-lib.test.ts`
  (jsdom + Testing Library, `mockCockpit()` fixtures).
- Read: `developer-cockpit/spec/03-features.md` §1, `02-information-architecture.md`; the dataviz
  method (form, colour by job, validator, marks, accessibility). OMS framework specs do not apply.

## Approach

### 1. Data (lib/spec-tickets.ts)

```ts
export const DISTRIBUTION_ORDER: SpecTicketStatus[] = ['proposal','design','plan','implement','verify','done','blocked'];
export interface StageShare { stage: SpecTicketStatus; count: number; pct: number }   // pct 0–100, unrounded
export function stageDistribution(tickets): { total: number; shares: StageShare[] }    // non-archived; only count > 0; in order
```

`summarize()` gains `mineInProgress: SpecTicketSummary[]` (non-archived, `isMine`, status ≠ done).
`perStage` is removed (changed during implementation, review finding: nothing used it any more;
`stageDistribution` counts on its own).

### 2. Dashboard (AC-1 … AC-5, AC-9)

`DashboardView` = heading + `<SpecOverview/>` + `<TicketTable/>`; `QUICK_LINKS` and Getting Started
removed (the sidebar and Ctrl+K cover navigation).

`SpecOverview` (keeps load + live refresh) renders a card with:
- `<StageDistribution tickets/>` (new, `views/dashboard/StageDistribution.tsx`) — see §4;
- task completion (unchanged markup);
- `<NeedsMe/>`: three `TicketLinks` groups *Awaiting approval*, *Blocked* (mine first, as today) and
  *Mine in progress* (`summarize().mineInProgress`), each with its empty message.

`TicketTable` (`views/dashboard/TicketTable.tsx`) is today's `TicketList` moved and renamed: header
"Tickets" + `NewTicketDialog`, new-ticket `ActionOutput`, filters, table, error rows — logic
unchanged. Row click → `openTicket(id)`.

`openTicket(id)` (new, `lib/open-ticket.ts`): `await useSpecTicketsStore.getState().select(id)`
then, if the selection actually changed to `id` (guard not cancelled), `setActiveView('spec-tickets')`.
Used by table rows and Needs me links (replaces `SpecOverview.open`).

New ticket: `run()` returns `Promise<string | null>` (the created id, else null); `NewTicketDialog`
takes an optional `onCreated(id)`; the Dashboard passes `() => setActiveView('spec-tickets')` (the
store already selected it). In Spec Tickets no callback is needed.

### 3. Spec Tickets workspace (AC-6 … AC-8)

`SpecTicketsView`: full height column.
- Header bar (`<header aria-label="Ticket workspace">`): `<TicketSwitcher/>`, flexible gap,
  `NewTicketDialog`, `Button variant="ghost"` **All tickets** → `setActiveView('dashboard')`; below it
  the new-ticket `ActionOutput` (moved from TicketList).
- Body: selected → `<TicketDetail/>`; none → empty state: "Pick a ticket above, or browse all tickets
  on the Dashboard." with an inline **Dashboard** link (AC-8).

`TicketSwitcher` (new, `views/spec-tickets/TicketSwitcher.tsx`), no new dependency, ARIA combobox
pattern:
- trigger button (`aria-haspopup="listbox"`, label "Switch ticket") showing the selected ticket's id
  and title, or "Select a ticket…";
- open → panel with an `<input role="combobox" aria-expanded aria-controls aria-activedescendant
  placeholder="Search id or title">` (autofocus) and `<ul role="listbox">` of `role="option"` items
  (id · title · `StageBadge`), filtered case-insensitively on id/title over `store.tickets` (all
  loaded tickets, not the Dashboard's mine-only filter);
- ArrowUp/Down move the active option, Enter or click selects, Escape or outside click closes;
- selecting calls `store.select(id)` — the SPEC-0004 guard asks before discarding edits (AC-7).

`TicketDetail` layout (`TicketDetailBody`): CSS grid `lg:grid-cols-[minmax(0,1fr)_22rem]`, gap 6:
- `<section aria-label="Ticket">` (main): header + meta + `StageProgress` + blocked line, Goal,
  document `Tabs` (editor unchanged), Log;
- `<aside aria-label="Ticket status">` (rail, sticky top): gate card (`GateResult`, next step,
  `TicketActions`), `Traceability`, `Evidence` stacked.
Below `lg` the rail stacks under the main column. No behaviour change inside the pieces.

### 4. Stage distribution chart (dataviz method)

- **Form:** part-to-whole of 7 ordered states, small n → one horizontal 100% stacked bar + legend
  (proposal accepted a bar over a pie). Single measure, one axis.
- **Colour by job:** the five active stages are an *ordinal* progression → one blue ramp, light→dark
  along the pipeline; *done* (out of the pipeline) is neutral grey; *blocked* is the reserved
  status-critical colour **with an icon and label** (never colour alone). Validated with
  `validate_palette.js --ordinal` (6 ordinal steps cannot clear the light-mode step gap — enumerated
  all combinations, none passed — hence 5 + neutral):

  | role | light | dark |
  |---|---|---|
  | proposal | `#86b6ef` | `#cde2fb` |
  | design | `#5598e7` | `#9ec5f4` |
  | plan | `#2a78d6` | `#6da7ec` |
  | implement | `#1c5cab` | `#3987e5` |
  | verify | `#104281` | `#256abf` |
  | done | `#898781` | `#898781` |
  | blocked | `#d03b3b` | `#d03b3b` |

  Validated against the surfaces the chart actually sits on (the Card: light `#ffffff`, dark
  `#1e293b`). Light ramp: ALL CHECKS PASS (light end 2.11:1). Dark ramp: ALL CHECKS PASS (end
  2.71:1); *changed during implementation*: the first dark choice ended at `#184f95`, which passed on
  the method's default dark surface but is 1.81:1 on the cockpit's card, below the 2:1 floor.
  Boundary verify → done → blocked: CVD ΔE ≥ 9.1, normal-vision ΔE ≥ 18.5 in both modes; the only
  failing check is the chroma floor of the neutral grey, which is intended (done is not a series
  hue). The dark verify step is 2.71:1 (< 3:1): relief is the always-visible legend with counts (the
  table view). Defined as `--stage-<name>` custom properties in `globals.css` under `:root` (light)
  and `.dark`; the chart uses `var(--stage-…)` only.
- **Marks:** bar height 12px, 2px surface gap between segments, 4px rounded outer ends, minimum
  rendered width 2px so a 1-of-50 segment stays visible; recessive (no axis — a 100% bar).
- **Labels/legend:** legend always present (≥ 2 series): swatch + stage + count + rounded % in text
  tokens (never the series colour); blocked's legend item carries the alert icon. No numbers on the
  bar itself.
- **Hover:** each segment has a native tooltip (`title`: "implement: 3 of 8 (38%)"); hit target is
  the full segment height. Segments are not separately focusable: the bar is one `role="img"` whose
  label and the legend already carry every number for keyboard and screen-reader users.
- **Percentages** are rounded once, from the raw ratio (`Math.round(100 × count / total)`), for the
  legend, label and tooltip; the unrounded share drives the segment width.
- **Accessibility / table view:** the bar is `role="img"` with an `aria-label` listing every non-empty
  stage with count and %, the legend is the table view; empty state "No active tickets yet." when
  total = 0.

## Contract Changes

None — no OpenAPI/Avro change; no IPC change.

## Data & Persistence

None — no data written; renderer-only.

## Events & Messaging

None — reuses `specs:tickets-changed` (live refresh) unchanged.

## Domain, State & Orchestration

None for OMS. Renderer state: `run()` now returns the created id; ticket selection still goes only
through `useSpecTicketsStore.select` (keeping the unsaved-edit guard).

## Alternatives & Decisions

- **Stacked bar, not pie** (accepted in the proposal): keeps pipeline order; comparable lengths.
- **Ordinal blue ramp for five active stages + neutral done + status-critical blocked** instead of
  categorical hues: the stages are ordered, and six ordinal steps fail the light-mode gap check
  (validator, every combination). Rejected: 7 categorical hues (loses order, and the reference
  palette validates only the first 3 slots all-pairs).
- **Move `TicketList` as `TicketTable`** rather than rewrite: SPEC-0002 behaviour carries over with
  its tests.
- **Own combobox** for the switcher instead of a new library (cmdk, Radix Popover): P-17; the pattern
  is small and fully testable.
- **`openTicket` helper** awaiting `select` before navigating, so a cancelled guard does not switch
  view either.
- **No new dependency or build change.**

- **Changed during implementation (review):** the Dashboard shows the store's `error` banner (load
  and action failures), as Spec Tickets does, so nothing is swallowed where the list now lives (P-13).
  `run()` returns the created id only if it is actually selected. The switcher returns focus to its
  trigger on close, keeps the active option scrolled into view, and closes when focus leaves it.
  Accepted: opening a ticket from the Dashboard re-reads it once more on Spec Tickets mount (one
  extra `spec status`; no race, guarded by the store's sequence/selection checks) — kept for
  simplicity, since the re-read also refreshes a ticket remembered from earlier.

## Risks & Mitigations

- *Losing SPEC-0002/0004 behaviour while moving components* → the existing tests move with the
  components and must stay green (`SpecTicketsView.test` cases become `TicketTable` cases).
- *Switcher keyboard/focus bugs* → explicit tests for typing, arrows, Enter, Escape, outside click.
- *Tiny segments invisible* → 2px minimum width; the legend and aria-label always carry the numbers.
- *Narrow windows* → rail stacks below `lg`; checked in the runtime look.

## Test Strategy

| AC | Level (unit / web-mvc / integration / e2e) | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | component | `test/renderer/Dashboard.test.tsx` — "shows the portfolio and no quick links or getting started" | No quick-link card titles / "Getting Started"; chart, task completion, Needs me, ticket table present |
| AC-2 | unit + component | `test/renderer/spec-tickets-lib.test.ts` — "stageDistribution orders, counts and excludes archived"; `test/renderer/StageDistribution.test.tsx` — "segments, widths, legend and text alternative", "empty state without active tickets" | Order, widths ±1pp, legend count/%, aria-label numbers, blocked icon, empty state |
| AC-3 | unit + component | `spec-tickets-lib.test.ts` — "summarize lists my tickets in progress"; `Dashboard.test.tsx` — "Needs me groups awaiting, blocked and mine in progress" | Three groups, mine first, empty messages |
| AC-4 | component | `test/renderer/TicketTable.test.tsx` — the four former `SpecTicketsView.test.tsx` cases (my/all, no git user, error rows, filters) + "new ticket from the dashboard opens it in Spec Tickets"; `NewTicketDialog.test.tsx` unchanged | Same behaviour on the Dashboard; CLI action called |
| AC-5 | component | `Dashboard.test.tsx` — "clicking a table row or Needs me entry opens the ticket"; `TicketTable.test.tsx` — "new ticket from the dashboard opens it in Spec Tickets" | `selectedId` and `activeView = spec-tickets` |
| AC-6 | component | `test/renderer/SpecTicketsView.test.tsx` — "workspace has a header with switcher, New ticket and All tickets, and no list" ; `TicketDetail.test.tsx` — "main region and status rail" | No table; header controls; All tickets → dashboard; `section[aria-label=Ticket]` has Goal/documents/log, `aside[aria-label="Ticket status"]` has gate/actions/tasks/evidence |
| AC-7 | component | `test/renderer/TicketSwitcher.test.tsx` — "filters by id or title and selects with Enter or click", "keyboard navigation and Escape", "asks before discarding unsaved edits" | Options filtered; selection; guard cancel keeps ticket and text |
| AC-8 | component | `SpecTicketsView.test.tsx` — "without a selection shows the switcher and a Dashboard hint" | Hint text, link to dashboard |
| AC-9 | component | `Dashboard.test.tsx` — "live refresh updates chart, needs me and table"; existing `specTickets-store.test.ts` live-refresh test for the open ticket | After a `specs:tickets-changed` event the new state is rendered |

Runtime look in verify: built app over CDP, Dashboard and Spec Tickets in dark theme (screenshot
via CDP `Page.captureScreenshot`) to check layout, label collisions and the rail.

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contracts involved. |
| P-02 | Specification before code, generated models only | n/a | No API or message change. |
| P-03 | Never edit generated code | comply | No generated or `dist/` file edited. |
| P-04 | Contracts evolve compatibly | n/a | No contract change. |
| P-05 | Every state change is recorded in the event log | n/a | No order state. |
| P-06 | Kafka only through the transactional outbox | n/a | No Kafka. |
| P-07 | Schema changes through new Liquibase changesets | n/a | No database. |
| P-08 | Concurrency and idempotency are explicit | n/a | No new writers; selection keeps its sequence guard. |
| P-09 | Commands and queries stay separate | n/a | No OMS API. |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No order transitions; ticket transitions stay in the CLI. |
| P-11 | Layering and conventions | comply | Pure functions in `lib/`, components in `views/`, state in existing stores; moved component keeps its logic. |
| P-12 | Jackson 3 only | n/a | TypeScript only. |
| P-13 | Errors and validation follow the framework specs | n/a | No new input handling beyond UI filtering; existing error rows/outputs kept. |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Test Strategy covers every AC; tests written first. |
| P-15 | Observability | n/a | No new main-process flow; renderer-only layout. |
| P-16 | Security | comply | No new IPC or input path; text filters only. |
| P-17 | Simplicity and dependencies | comply | No new dependency (chart in CSS, own combobox). |
| P-18 | Modules build standalone | comply | developer-cockpit typecheck + tests. |
| P-19 | Documentation follows behaviour | comply | `developer-cockpit/spec/03-features.md` §1 and `02-information-architecture.md` updated. |

## Knowledge Base Updates

None in `oms-knowledge-base/` (no OMS behaviour change). Cockpit docs:

- `developer-cockpit/spec/03-features.md` §1 — Dashboard (chart, completion, Needs me, ticket table)
  and Spec Tickets workspace (switcher, main column + rail); remove the list-pane description.
- `developer-cockpit/spec/02-information-architecture.md` — Dashboard purpose: spec portfolio.
