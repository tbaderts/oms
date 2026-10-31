# Proposal — SPEC-0017: Merge signals into ticket progress card

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

After SPEC-0016 the Dashboard shows two cards side by side under the KPI tiles:
- *Ticket progress*: the donut and its legend;
- *Signals*: *Your turn*, plus an *Activity* feed of up to 20 entries in a 22rem scroll box.

The *Signals* card is the taller of the two, so it sets the height of the row. The donut card then
has a large empty area below its legend, and the ticket table starts far down the screen (see the
SPEC-0016 T-6 screenshots).

The requester wants to "combine the signals header/title part with the ticket progress panel and
make the panel expand activities below when clicking on it", to save screen space
([ticket Goal](./ticket.md)). They chose the layout on 2026-10-30:
- one full-width card, with the donut and legend on the left and *Your turn* on the right;
- a one-line *Activity* bar below them, which expands the feed when clicked.

If nothing is done, the full feed keeps taking space on every visit, although the status-bar
indicator and the toasts already announce new critical events.

## What Changes

- **One *Ticket progress* card** spans the full width under the KPI tiles:
  - left: the donut and its legend, as in SPEC-0015;
  - right: *Your turn* (awaiting approval and blocked, the user's own first), as in SPEC-0016.

  The separate *Signals* card goes away.
- **Activity bar**, at the bottom of that card and collapsed by default. It is one line with:
  - the label *Activity*;
  - the number of new entries;
  - the latest entry (level icon and label, time, ticket id, event text).
- **Expanding the bar:** clicking it, or pressing Enter or Space, expands the feed below the bar
  across the card's full width. Clicking it again collapses the feed. The feed is the SPEC-0016
  feed: the 20 most recent entries, newest first, with levels and the *new* marker; each entry opens
  its ticket.
- **The expanded or collapsed state** is kept for the session, across live refreshes and when the
  user returns to the Dashboard.
- **Status-bar indicator:** clicking it opens the Dashboard with the *Activity* feed expanded, so
  the signals it counted are visible.
- No **BREAKING** changes. The toasts, the status-bar count, the signal levels and *Your turn*
  ordering stay as SPEC-0016 defined them.

## Scope

### In scope

- The Dashboard layout of the donut, *Your turn* and *Activity* in one card.
- The collapsible *Activity* bar and its summary line.
- Opening the Dashboard with *Activity* expanded from the status-bar indicator.

### Out of scope

- Changes to how signals are derived, classified, counted or toasted (SPEC-0016).
- Changes to the KPI tiles, the donut or the ticket table.
- Remembering the expanded state across restarts.

## Acceptance Criteria

All criteria are proven by vitest component tests in jsdom with mocked tickets. The layout is also
checked with a screenshot of the built app.

- **AC-1** — Given active tickets with log entries, when the Dashboard renders, then a single *Ticket progress* card contains the donut, the legend, *Your turn* and the *Activity* bar, and no separate *Signals* card is rendered.
- **AC-2** — Given log entries, two of which arrived after the first load, when the Dashboard renders, then *Activity* is collapsed: its bar is a button with `aria-expanded="false"`, shows "2 new" and the latest entry's level label, time, ticket id and event text, and no feed entries are rendered.
- **AC-3** — Given the collapsed *Activity* bar, when the user clicks it (or presses Enter or Space on it), then the feed of the 20 most recent entries appears below it, newest first, with level labels and *new* markers, and the bar reports `aria-expanded="true"`. When the user clicks it again, the feed is hidden.
- **AC-4** — Given *Activity* is expanded, when a live refresh brings a new entry, then the feed stays expanded and shows the entry at the top. When the user leaves the Dashboard and comes back in the same session, the feed is still expanded.
- **AC-5** — Given the status-bar indicator shows unseen signals while another view is open, when the user clicks it, then the Dashboard opens with *Activity* expanded.
- **AC-6** — Given active tickets without log entries, when the Dashboard renders, then the *Activity* bar reads "No activity yet." and cannot be expanded. Given a ticket load error, the card shows that tickets and signals are unavailable, with no *Your turn* empty state and no *Activity* bar.

## Impact

| Area | Impact |
|---|---|
| Modules | `developer-cockpit` only (renderer: Dashboard views, signals store, status bar) |
| Contracts (OpenAPI / Avro) | None |
| Data (tables, migrations) | None |
| Events / Kafka topics | None |
| Consumers (oms-ui, oms-mcp-server, downstream) | None |
| Knowledge base | `developer-cockpit/spec/03-features.md` §1 (Dashboard rows) and `02-information-architecture.md`; no `oms-knowledge-base/` page covers the cockpit |

## Open Questions

- [resolved] Which layout? → the requester chose one full-width card, with the donut and legend on the left, *Your turn* on the right and the *Activity* bar below (2026-10-30).
- [resolved] Process → a new spec ticket, as the requester chose. SPEC-0016 stays done.
- [resolved] Should *Activity* start expanded or collapsed? → collapsed, which is the point of saving space (from the goal: "expand activities below when clicking").
- [resolved] Where is the expanded state kept? → assumption: in memory for the session, like the SPEC-0016 seen state. It is cheap to persist later.
- [resolved] Should the status-bar indicator expand the feed? → assumption: yes. With the feed collapsed by default, landing on the Dashboard after clicking "3 new signals" would otherwise show only the one-line summary. This adds to SPEC-0016's behaviour without changing it.
- [resolved] What does "new" count in the bar? → assumption: the entries in the feed window (the 20 most recent) marked *new* by SPEC-0016, the same entries that show the *new* pill when the feed is expanded.
