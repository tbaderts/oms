# Proposal — SPEC-0015: Add donut chart and KPI tiles to dashboard

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The cockpit Dashboard (SPEC-0006) is the first screen people see.

- **Today:**
  - one *Spec workflow* card with a 12 px high 100% stacked bar of active tickets per stage;
  - a small task-completion number;
  - the *Needs me* list;
  - the ticket table.
- **The colours** of the stages (`--stage-*` in `globals.css`) are one blue ramp from light to
  dark, plus grey for done and red for blocked. Neighbouring stages are hard to tell apart, and the
  screen reads as monochrome.
- **The headline numbers** (how many tickets are active, waiting for approval, blocked or done)
  have to be counted from the bar, the legend or the table.

The requester wants a more appealing top-level overview: a pie chart of ticket progress by state,
KPI tiles, and more colour ([ticket Goal](./ticket.md)). The dashboard is also used to show the
spec workflow to others, so a clear, colourful summary matters.

If nothing is done, the dashboard keeps working but stays hard to read at a glance.

## What Changes

- **Overview row** at the top of the Dashboard, below the title:
  - **KPI tiles**, each with its own colour accent and icon: *Active tickets*, *In progress*
    (active and not done), *Awaiting approval*, *Blocked*, *Done*, and *Task completion* as a
    percentage with a small progress ring.
  - A **donut chart** of the active tickets by stage in pipeline order (proposal, design, plan,
    implement, verify, done, then blocked), with the total in the centre and a legend that shows
    each stage's count and share.
- **Stage colours** become a distinct colour per stage (a categorical palette) in both the light
  and dark themes. The same colours are used by the donut, its legend and the stage badges in the
  ticket table.
- **Filtering from the overview.** Clicking a donut segment or a legend entry filters the ticket
  table below to that stage. Clicking it again, or clicking *Clear*, removes the filter. The
  *Blocked* and *Done* tiles filter the same way.
- The old stacked bar is replaced by the donut. *Needs me* and the ticket table stay as they are.
- No **BREAKING** changes; nothing outside `developer-cockpit` changes.

## Scope

### In scope

- The overview row (KPI tiles and donut) on the Dashboard.
- The new stage colour tokens for light and dark themes.
- Stage filtering from the donut, its legend and the Blocked and Done tiles.
- Accessible text alternatives and keyboard access for the chart.

### Out of scope

- Charts over time (throughput, cycle time, "done this week"). Ticket summaries carry no completion
  date, so these would need new data from the spec CLI.
- Charts of tickets by type or by module, and an activity timeline. The requester chose KPI tiles
  only (2026-10-30).
- Changes to *Needs me*, the ticket table's columns, or other views.
- A charting library, if plain SVG is enough; design decides.

## Acceptance Criteria

All criteria are proven by vitest component tests on the Dashboard, rendered with mocked tickets,
in jsdom.

- **AC-1** — Given active tickets in several stages (for example 2 proposal, 1 implement, 1 done, 1 blocked) and one archived ticket, when the Dashboard renders, then a donut shows one segment per non-empty stage in pipeline order (proposal, design, plan, implement, verify, done, blocked), each segment's arc is proportional to its count among the 5 active tickets, the centre shows the total 5, the archived ticket is not counted, and the chart has a text alternative listing every stage with its count and percentage.
- **AC-2** — Given the stage colour tokens in `globals.css`, when they are compared, then in both the light and the dark theme every stage has its own colour, any two stages differ in hue by at least 25°, and every colour has a contrast ratio of at least 3:1 against that theme's card background.
- **AC-3** — Given the same tickets plus 2 awaiting approval and task counts of 3 done out of 10, when the Dashboard renders, then the KPI tiles show *Active tickets* 5, *In progress* 4, *Awaiting approval* 2, *Blocked* 1, *Done* 1 and *Task completion* 30%, each tile with its own colour accent.
- **AC-4** — Given the Dashboard with the ticket table, when the user clicks the *implement* donut segment, then the table shows only the tickets in implement and the overview shows an active-filter chip. When the user clicks the same segment again or the chip's *Clear*, the table shows all tickets again. A legend entry and the *Blocked* and *Done* tiles filter the same way.
- **AC-5** — Given the donut, when a segment receives keyboard focus or the pointer hovers over it, then its stage, count and percentage are shown. Enter or Space on a focused segment applies the filter from AC-4.
- **AC-6** — Given no active tickets, when the Dashboard renders, then the donut area shows "No active tickets yet", the count tiles show 0, and *Task completion* shows "–".
- **AC-7** — Given the Dashboard is open, when the tickets change on disk (the live refresh event), then the donut, the legend and the KPI tiles show the new counts without a reload. Given a load error, the error is shown and the overview does not present an empty portfolio as if there were no tickets.

## Impact

| Area | Impact |
|---|---|
| Modules | `developer-cockpit` only (renderer: Dashboard views, stage colour tokens, ticket-table filter state) |
| Contracts (OpenAPI / Avro) | None |
| Data (tables, migrations) | None |
| Events / Kafka topics | None |
| Consumers (oms-ui, oms-mcp-server, downstream) | None |
| Knowledge base | `developer-cockpit/spec/03-features.md` (Dashboard section) describes the overview row; no `oms-knowledge-base/` page covers the dashboard layout |

## Open Questions

- [resolved] What does "ticket progress by states" mean? → assumption: the spec workflow stages of the active tickets (proposal → done, plus blocked), the same data the stacked bar shows today; archived tickets are excluded, as they are today.
- [resolved] Pie or donut? → assumption: a donut. It is a pie chart with the total in the middle and reads better for a handful of categories; easy to change in design.
- [resolved] Does the donut replace the stacked bar? → assumption: yes; both would show the same data twice.
- [resolved] Which extra overview content? → KPI tiles only (requester, 2026-10-30). Charts by type or module and an activity timeline are out of scope.
- [resolved] "Done this week" tile? → not possible without completion dates in the ticket data; replaced by a *Done* count. A time-based view would be a separate ticket.
