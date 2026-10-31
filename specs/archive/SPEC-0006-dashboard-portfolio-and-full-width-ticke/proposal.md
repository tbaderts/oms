# Proposal — SPEC-0006: Dashboard portfolio and full-width ticket workspace

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The requester: *"I'm not happy with the layout of dashboards and spec tickets tab. Dashboard has a
lot of redundancy with the sidebar and spec tickets is a bit crowded."*

Today (developer-cockpit, after SPEC-0002/0004/0005):

- **Dashboard** (`views/dashboard/DashboardView.tsx`): a heading, the *Spec workflow* card
  (`SpecOverview`: per-stage counts as boxes, task completion, awaiting-approval and blocked lists),
  then seven **quick-link cards** that repeat sidebar entries one-to-one, and a **Getting Started**
  card that tells you to use the sidebar or Ctrl+K. More than half of the page duplicates navigation.
- **Spec Tickets** (`views/spec-tickets/SpecTicketsView.tsx`): a 50/50 split. The left half is the
  filterable ticket table (`TicketList`); the right half is the ticket detail (`TicketDetail`):
  header, Goal, gate + actions, tasks/ACs and evidence, document tabs (now with the SPEC-0004 editor),
  log, all stacked in one column. The editor and the documents, which are the actual work, get about
  a quarter of the screen.

So the overview of all tickets and the work on one ticket compete for the same view, while the
Dashboard, which should hold the overview, is mostly links.

Requester goal (ticket.md, abridged): *"Move some of that to the dashboard and make more room for the
actual ticket pane: use the ticket pane across the main panel with the ticket selector in the top bar,
and show ticket status and progress on the dashboard, like a chart of the distribution of ticket
states."* Agreed direction: Dashboard = portfolio (stage distribution chart, task completion,
needs-me list, ticket table with filters); Spec Tickets = full-width single-ticket workspace with a
searchable switcher in the header, documents/editor as the main column, gate/actions/tasks/evidence
in a side rail.

## What Changes

- **Dashboard becomes the portfolio view.** The quick-link cards and the Getting Started card are
  removed. It shows, top to bottom:
  - a **stage distribution chart**: one horizontal bar split into segments per stage in pipeline
    order (proposal → design → plan → implement → verify → done), then *blocked*, each segment's
    length proportional to its share of the active tickets, with a legend giving stage, count and
    percentage;
  - **task completion** across active tickets (percentage and bar, as today);
  - a **Needs me** panel: tickets awaiting approval, blocked tickets (mine first in both), and my
    tickets in progress (owner = git user, stage not done);
  - the **ticket table** with its existing filters (My/All tickets, stage, module, search, show
    archived), error rows and the **New ticket** button, moved here from Spec Tickets.
  Clicking any ticket on the Dashboard opens it in Spec Tickets.
- **Spec Tickets becomes a single-ticket workspace across the whole content area.** The list pane is
  removed. A header bar holds a **ticket switcher** (searchable by id or title; each option shows id,
  title and stage), **New ticket**, and an **All tickets** link back to the Dashboard. Below it, the
  ticket:
  - main column: title/meta, stage progress, Goal, the document tabs with the editor, the log;
  - side rail: gate result with next step and actions, tasks and AC coverage, verification evidence.
  With no ticket selected it shows the switcher and a pointer to the Dashboard.
- Behaviour from SPEC-0002 and SPEC-0004 stays the same, only its location changes: filters and
  "My tickets" default, error rows, live refresh, workflow actions, editing, unsaved-edit guards
  (switching tickets in the switcher asks first when there are unsaved edits).
- No new dependency (the chart is drawn without a chart library). No change outside
  developer-cockpit. Nothing is **BREAKING** outside the cockpit; inside it, `SpecOverview`'s
  per-stage boxes become the chart.

## Scope

### In scope

- Dashboard content and layout as above; Spec Tickets workspace layout and switcher.
- Moving `TicketList` (filters, table, new ticket, error rows) to the Dashboard.
- Tests for every AC; a runtime look at both views in the built app.
- Updating `developer-cockpit/spec/03-features.md` §1 and `02-information-architecture.md`.

### Out of scope

- New metrics beyond stage distribution, task completion and the needs-me lists (cycle time,
  throughput, burn-down, history).
- A global, app-wide top bar; the switcher lives in the Spec Tickets header.
- Changing the workflow, the CLI, ticket data or the document editor's behaviour.
- Other Dashboard widgets (git status, infrastructure); the Dashboard is spec-workflow only for now.
- Responsive/mobile layouts beyond the Electron window's existing minimum size.

## Acceptance Criteria

- **AC-1** — Given the Dashboard is opened, when it renders, then it contains no quick-link cards and
  no Getting Started card, and it contains the stage distribution chart, task completion, the Needs
  me panel and the ticket table.
- **AC-2** — Given active tickets with known stages (e.g. 2 proposal, 1 design, 3 implement, 1 done,
  1 blocked), when the stage distribution chart renders, then it has one segment per non-empty stage
  in the order proposal, design, plan, implement, verify, done, blocked; each segment's share of the
  bar equals its count divided by the number of active tickets (±1 percentage point); the legend
  shows each stage with its count and rounded percentage; the chart has a text alternative listing
  the same numbers; and with no active tickets it shows an empty state instead of a bar. Archived
  tickets are not counted.
- **AC-3** — Given tickets that are awaiting approval, blocked, or owned by the git user and not done,
  when the Needs me panel renders, then it lists them in three groups (awaiting approval, blocked,
  mine in progress), with the user's own tickets first in the first two groups, and shows an empty
  message per group with nothing in it.
- **AC-4** — Given the ticket table on the Dashboard, when the user filters, then it behaves as the
  Spec Tickets list did (SPEC-0002 AC-1, AC-3, AC-10): My tickets by default (all tickets when no git
  user is configured), All tickets toggle, stage, module and text filters, show archived, error rows
  for folders that fail to load; and **New ticket** creates a ticket through the CLI as before.
- **AC-5** — Given any ticket shown on the Dashboard (chart legend excluded; table row, Needs me
  entry), when the user clicks it, then Spec Tickets opens with that ticket selected; and after
  **New ticket** succeeds from the Dashboard, Spec Tickets opens with the new ticket selected.
- **AC-6** — Given Spec Tickets is open, when it renders, then there is no ticket list pane; the
  header shows the ticket switcher, New ticket and an All tickets link that opens the Dashboard; and
  the ticket uses the full content width with a main region (title, stage progress, Goal, documents,
  log) and a side rail (gate result, next step, actions, tasks/ACs, evidence).
- **AC-7** — Given the ticket switcher, when the user opens it and types part of an id or title, then
  only matching tickets are offered (each with id, title and stage), selecting one (click or Enter)
  shows that ticket, and with unsaved document edits the existing confirmation is asked first (cancel
  keeps the current ticket and the edits).
- **AC-8** — Given Spec Tickets with no ticket selected, when it renders, then it shows the switcher
  and a hint to pick a ticket or browse all tickets on the Dashboard, not an empty pane.
- **AC-9** — Given the Dashboard or Spec Tickets is open, when ticket files change on disk, then the
  chart, Needs me, table and the open ticket update without user action (existing live refresh,
  `specs:tickets-changed`).

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit renderer only (Dashboard, SpecOverview, TicketList, SpecTicketsView, TicketDetail layout, a new switcher and chart component). |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none; reuses `specs:tickets-changed`. |
| Consumers (oms-ui, oms-mcp-server, downstream) | none |
| Knowledge base | `developer-cockpit/spec/03-features.md` §1 (Dashboard and Spec Tickets layout), `02-information-architecture.md` (Dashboard purpose). No `oms-knowledge-base/` change. |

## Open Questions

- [resolved] Pie chart or bar? → assumption: a single horizontal stacked bar ordered by stage plus a
  legend. Stages form a pipeline; a pie loses that order and is hard to compare (proposed to and
  accepted by the requester). Easy to swap for a donut later.
- [resolved] Where does the ticket selector go? → assumption: the Spec Tickets header (the cockpit
  has no app-wide top bar; adding one is out of scope).
- [resolved] Which tickets count in the chart? → assumption: all non-archived tickets, done included
  (as SPEC-0002's per-stage counts); archived are excluded.
- [resolved] What is "mine in progress"? → assumption: owner equals git user.name (as "My tickets")
  and stage is not done; blocked and awaiting tickets also appear in their own groups.
- [resolved] Does Spec Tickets auto-select a ticket when opened from the sidebar? → assumption: it
  keeps the last selected ticket; with none, it shows the switcher and a hint (AC-8), no guess.
- [deferred] Keyboard shortcut to open the switcher from anywhere → the command palette (Ctrl+K)
  already exists; integrating tickets into it can follow later.
