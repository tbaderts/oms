# Verification — SPEC-0006: Dashboard portfolio and full-width ticket workspace

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify` (`evidence/developer-cockpit-2.log`:
29 files / 118 tests + perf test). Test files are under `developer-cockpit/test/renderer/`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Dashboard: no quick links / Getting Started; chart, completion, Needs me, table | `Dashboard.test.tsx` — "shows the portfolio and no quick links or getting started"; runtime screenshot `dashboard.png` | PASS |
| AC-2 | Stage chart: order, proportional segments, legend count + rounded %, text alternative, empty state, archived excluded | `StageDistribution.test.tsx` — "segments, widths, legend and text alternative", "rounds each percentage once, from the raw share" (5 of 11 → 45%), "empty state without active tickets"; `spec-tickets-lib.test.ts` — "stageDistribution orders, counts and excludes archived"; colours validated with the dataviz validator on the real card surfaces (design.md §4) | PASS |
| AC-3 | Needs me: awaiting, blocked, mine in progress; mine first; empty messages | `Dashboard.test.tsx` — "Needs me groups awaiting, blocked and mine in progress"; `spec-tickets-lib.test.ts` — "summarize lists my tickets in progress", "summarize counts stages, awaiting, blocked and completion" (mine first) | PASS |
| AC-4 | Ticket table on the Dashboard behaves as before | `TicketTable.test.tsx` — my/all toggle, no-git-user fallback, error rows, "stage, module and search filters and show archived drive the table", new ticket; `NewTicketDialog.test.tsx`; `Dashboard.test.tsx` — "shows load errors instead of an empty portfolio"; `specTickets-store.test.ts` — "keeps an action error visible across the refresh that follows" | PASS |
| AC-5 | Clicking a ticket or creating one opens Spec Tickets with it selected | `Dashboard.test.tsx` — "clicking a table row or Needs me entry opens the ticket"; `TicketTable.test.tsx` — "opens a clicked ticket in Spec Tickets", "new ticket from the dashboard opens it in Spec Tickets"; `specTickets-store.test.ts` — openTicket and run() id incl. cancelled guard | PASS |
| AC-6 | Workspace: no list; header with switcher, New ticket, All tickets; main region + status rail | `SpecTicketsView.test.tsx` — "workspace has a header with switcher, New ticket and All tickets, and no list"; `TicketDetail.test.tsx` — "main region and status rail"; runtime `workspace.png` (main 784 px, rail 352 px, no overlap) | PASS |
| AC-7 | Switcher: filter by id/title, Enter/click, unsaved-edit confirmation | `TicketSwitcher.test.tsx` — "filters by id or title and selects with Enter or click", "keyboard navigation and Escape", "returns focus to the trigger, keeps the active option visible and closes when focus leaves", "marks the active option with a colour that differs from the popup, and survives clicks on the popup", "asks before discarding unsaved edits" | PASS |
| AC-8 | No selection: switcher + Dashboard hint | `SpecTicketsView.test.tsx` — "without a selection shows the switcher and a Dashboard hint" | PASS |
| AC-9 | Live updates on Dashboard and Spec Tickets | `Dashboard.test.tsx` — "live refresh updates chart, needs me and table"; `specTickets-store.test.ts` — "refreshes list and open detail on specs:tickets-changed" | PASS |

**Runtime look (T-9):** built app over CDP at 1440×900, dark theme. Dashboard: chart "6 active
tickets: implement 1 (17%), done 5 (83%)", legend, task completion, Needs me, 6 table rows, no
quick links. Spec Tickets: header switcher / New ticket / All tickets, main column + rail, no
overlap, no console errors. The first screenshot showed task ids wrapping in the rail; fixed and
re-captured. The first attempt was blocked while the user's own cockpit held port 9321.

## Goal Assessment

The Goal: the Dashboard duplicated the sidebar and Spec Tickets was crowded; move the overview to
the Dashboard, give the ticket pane the whole main panel with a selector in the top bar, and show
status and progress on the Dashboard with a chart of the stage distribution.

Delivered: the Dashboard is now the portfolio (stage distribution chart, task completion, Needs me,
ticket table with filters and New ticket) and contains no navigation duplicates; Spec Tickets is a
full-width single-ticket workspace with a searchable switcher in its header and the status in a
side rail, giving the documents and editor most of the width. Confirmed in the running app.

Deliberate choices, agreed in the proposal: a stacked bar instead of a pie (keeps pipeline order);
the switcher lives in the Spec Tickets header because the cockpit has no app-wide top bar.

## Policy Review

Reviewed against the SPEC-0006 files only (the six R10 policy-check warnings come from unrelated
branch work: Gradle and docker-compose files).

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contracts involved. |
| P-02 | Specification before code, generated models only | N/A | No API or message change. |
| P-03 | Never edit generated code | PASS | No generated or `dist/` source edited. |
| P-04 | Contracts evolve compatibly | N/A | No contract change. |
| P-05 | Every state change is recorded in the event log | N/A | No order state. |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka. |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database. |
| P-08 | Concurrency and idempotency are explicit | N/A | No new writers; overlapping loads stay guarded by the store's sequence and selection checks. |
| P-09 | Commands and queries stay separate | N/A | No OMS API. |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order transitions. |
| P-11 | Layering and conventions | PASS | Pure functions in `lib/`, components in `views/`, state in the existing stores; moved table keeps its logic; dead `perStage` removed. |
| P-12 | Jackson 3 only | N/A | TypeScript only. |
| P-13 | Errors and validation follow the framework specs | PASS | Load/action errors are shown on the Dashboard (role="alert") as on Spec Tickets; nothing swallowed (tested). |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC traced above; tests written red first, except T-13 (coverage for existing behaviour). |
| P-15 | Observability | N/A | Renderer-only layout; no new main-process flow. |
| P-16 | Security | PASS | No new IPC or input path. |
| P-17 | Simplicity and dependencies | PASS | No new dependency (chart in CSS, own combobox). |
| P-18 | Modules build standalone | PASS | `npm run typecheck`, `npm test` (evidence logs 1, 2) and `npm run build`. |
| P-19 | Documentation follows behaviour | PASS | `developer-cockpit/spec/03-features.md` §1 and `02-information-architecture.md` updated. |

## Independent Review

**Round 1 (spec-reviewer): NOT MET.** The ticket was reopened at implement (T-11 … T-15):

1. *Blocking* — percentages rounded twice (5 of 11 showed 46%). **Fixed**: the share is unrounded
   and rounded once for display; test with 5 of 11.
2. *Major* — load/action errors swallowed on the Dashboard. **Fixed**: error banner (`role="alert"`)
   on the Dashboard; tested.
3. Dead `perStage`. **Removed**; the counts are still asserted via `stageDistribution`.
4. Design said segments are focusable and tokens live under `@theme`. **Design corrected**.
5. Dashboard filter controls and Show archived untested. **Covered** (T-13, existing behaviour).
6. Switcher focus/scroll/blur gaps. **Fixed**; tested.
7. Detail read twice when opening from the Dashboard. **Accepted**, documented in design.md.
8. `run()` returned the id after a cancelled selection. **Fixed**; tested.

**Round 2 (spec-reviewer): MET.** It confirmed every fix and ran its own runtime check (dashboard,
row → workspace, real mouse selection in the switcher). Findings and resolution (T-16):

1. *Major* — the active switcher option was invisible in dark mode (`bg-accent` equals
   `bg-popover`, `#1e293b`). **Fixed** with `bg-primary/15` + ring; tested, and a dark-theme
   screenshot shows the highlight (computed `oklab(… / 0.15)` on `rgb(30, 41, 59)`).
2. Action errors were cleared by the refresh after the action. **Fixed** (kept across the refresh);
   tested. The Dashboard test that only covered load errors was renamed accordingly.
3. Clicking the popup's padding would blur the input and close it. **Fixed** (mousedown on the popup
   is prevented except on the input); tested.
4. One stale line in design.md (`pct … 1 decimal`). **Corrected**.

`spec verify` and the switcher screenshot were re-run after these changes.

## Automated Evidence

`spec verify SPEC-0006` at 2026-10-27T07:46Z: result **pass**, modules `developer-cockpit`.

| Command | Exit | Log |
|---|---|---|
| policy check (changes since main) | PASS (0 errors; 6 R10 warnings from unrelated branch work) | — |
| `npm run typecheck` | 0 (7 s) | `evidence/developer-cockpit-1.log` |
| `npm test` | 0 (25 s; 118 tests + 1 perf test) | `evidence/developer-cockpit-2.log` |

## Follow-ups

- A second cockpit instance (e.g. a test run while the user's is open) fails on the WebSocket port
  9321 with a main-process error dialog instead of failing cleanly (pre-existing; found in T-9).
- Opening a ticket from the Dashboard reads it twice (accepted, documented in design.md).
- Tickets in the command palette (Ctrl+K), deferred in the proposal.

## Verdict

Verdict: GOAL MET
