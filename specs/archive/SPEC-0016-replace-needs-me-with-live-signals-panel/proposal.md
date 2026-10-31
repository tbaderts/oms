# Proposal — SPEC-0016: Replace Needs me with live signals panel

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The Dashboard's *Needs me* card (SPEC-0006) shows three lists: *Awaiting approval*, *Blocked* and
*Mine in progress*. The requester says it "looks a bit dull and is mostly redundant"
([ticket Goal](./ticket.md)), and the screen confirms it:

- After SPEC-0015 the KPI tiles already count *Awaiting approval* and *Blocked*. The *Blocked*
  tile filters the table to those tickets.
- *Mine in progress* repeats the ticket table with *My tickets* switched on. In the SPEC-0015
  screenshots it is the tallest part of the Dashboard, and it lists every non-done ticket of the
  owner.
- The card is static. Nothing tells the user that something just happened:
  - a gate passed and now waits for their approval;
  - a verify run failed;
  - an autopilot run reopened or blocked a ticket;
  - a ticket reached done.

  Today they only notice by watching the table change, or by reading a ticket's log.

Every one of these events is already recorded. The spec CLI appends a timestamped line to each
ticket's `## Log` for every gate result, approval, stage change, verify run, reopen, block,
unblock and autopilot switch, and the cockpit already reloads the tickets live
(`specs:tickets-changed`).

The requester prefers "more direct feedback and signals back into the console" over only
re-arranging the tiles. If nothing is done, the Dashboard keeps a large, redundant card, and the
user still has to poll for what happened, which matters most while an agent runs a ticket on
autopilot.

## What Changes

- **Signals panel replaces *Needs me*** (next to the ticket-progress donut). It has two parts:
  - **Your turn**: a short, pinned list of what waits for a human. These are tickets awaiting
    approval (with the stage to approve) and blocked tickets (with the reason), the user's own
    first. Each entry opens the ticket. When empty it shows "Nothing needs you."
  - **Activity**: a live feed of the most recent workflow events across all active tickets, newest
    first. Each entry shows the time, ticket id, title and event text, and is classified as
    *critical* (verify failed, blocked, reopened, autopilot switched off for lack of progress),
    *attention* (awaiting approval), *good* (verify passed, reached done) or *info* (everything
    else). The class is shown by an icon and a label as well as a colour. New entries are marked
    as new. Each entry opens its ticket.
  - The panel has a fixed height and scrolls, so it no longer sets the height of the row.
- ***Mine in progress* is removed.** The ticket table's *My tickets* filter covers it.
- **Signals reach the whole cockpit, not only the Dashboard:**
  - **Status bar indicator**: a count of unseen *critical* and *attention* signals plus the latest
    one's text, in every view. Clicking it opens the Dashboard and marks the signals as seen.
  - **In-app toast**: when a new *critical* or *attention* signal arrives, a toast shows the ticket
    id and event text with an *Open* action. *Good* and *info* signals do not toast.
- No **BREAKING** changes; nothing outside `developer-cockpit` changes. The spec CLI and the ticket
  log format stay as they are.

## Scope

### In scope

- The Signals panel (Your turn and Activity) in place of *Needs me*.
- Deriving and classifying signals from the ticket logs the cockpit already loads.
- The status-bar indicator and in-app toasts for new *critical* and *attention* signals.
- Seen and unseen state for the current session.

### Out of scope

- Operating-system desktop notifications and sounds.
- Signals from outside the spec workflow, such as Docker, Git, OMS health or Kafka.
- Persisting the seen state across restarts, or acknowledging individual signals.
- Changes to the spec CLI or to the ticket log format.
- Re-arranging the KPI tiles; SPEC-0015 just settled them.

## Acceptance Criteria

All criteria are proven by vitest component tests in jsdom, rendered with mocked tickets, unless
stated otherwise.

- **AC-1** — Given non-archived tickets whose logs contain timestamped entries and one archived ticket with log entries, when the Dashboard renders, then a *Signals* panel lists the 20 most recent entries of the non-archived tickets, newest first, each showing time, ticket id, title and event text. The archived ticket's entries are not shown, and the *Needs me* card and its *Mine in progress* list are no longer rendered.
- **AC-2** — Given log entries "verify run: fail", "blocked: <reason>", "reopened at <stage>: <reason>", "autopilot switched off: …", "<stage> gate passed; awaiting human approval", "verify run: pass", "verify → done" and "design → plan", when the panel renders them, then they are classified as critical, critical, critical, critical, attention, good, good and info, and each entry carries a class icon with a text label (never colour alone).
- **AC-3** — Given tickets awaiting approval and blocked tickets owned by the git user and by others, when the Dashboard renders, then *Your turn* lists them with the user's own first, shows the stage to approve or the blocked reason, and clicking an entry opens that ticket. Given none, it shows "Nothing needs you."
- **AC-4** — Given the Dashboard is open, when a ticket's log gains a new entry and the live refresh event fires, then the new entry appears at the top of *Activity*, marked as new, without a reload. Entries that existed when the cockpit first loaded the tickets are not marked as new.
- **AC-5** — Given the cockpit has loaded the tickets, when new *critical* or *attention* entries arrive through the live refresh, then the status bar shows the number of unseen ones and the latest one's text in any view. Clicking the indicator opens the Dashboard and resets the count to zero. New *good* or *info* entries do not change the count, and nothing is counted for entries present at the first load.
- **AC-6** — Given the cockpit has loaded the tickets, when a new *critical* or *attention* entry arrives, then a toast shows its ticket id and event text with an *Open* action that opens the ticket. When a new *good* or *info* entry arrives, no toast is shown.
- **AC-7** — Given a ticket load error, when the Dashboard renders, then the Signals panel shows that signals are unavailable and does not show "Nothing needs you." or an empty feed as if nothing had happened. Given log lines that do not match a known pattern, they are shown as *info* with their text unchanged.

## Impact

| Area | Impact |
|---|---|
| Modules | `developer-cockpit` only (renderer: Dashboard, status bar, toasts; possibly the ticket summary the main process returns, so that the list carries log entries) |
| Contracts (OpenAPI / Avro) | None |
| Data (tables, migrations) | None |
| Events / Kafka topics | None. The existing `specs:tickets-changed` WebSocket event is reused |
| Consumers (oms-ui, oms-mcp-server, downstream) | None |
| Knowledge base | `developer-cockpit/spec/03-features.md` §1 Dashboard and the status-bar description; no `oms-knowledge-base/` page covers the cockpit |

## Open Questions

- [resolved] Where do signals come from? → assumption: the ticket logs the spec CLI already writes. They cover every workflow event with a timestamp and need no new backend or CLI change. The ticket list does not carry the log today, so design decides how it gets there (for example a capped number of recent entries per ticket in the summary).
- [resolved] Re-arrange the tiles, or add live signals? → live signals, as the requester prefers. Re-arranging the tiles is out of scope.
- [resolved] Is *Needs me* removed entirely? → assumption: its actionable part (awaiting approval and blocked, mine first) stays as the compact *Your turn* list. *Mine in progress* is dropped, because the table's *My tickets* filter covers it.
- [resolved] Which signals interrupt the user? → assumption: only *critical* and *attention*, through the status-bar count and a toast. *Good* and *info* only appear in the feed, so autopilot runs do not cause a stream of toasts.
- [resolved] What counts as "new"? → assumption: entries that arrive after the cockpit's first ticket load in this session. The seen state is not persisted, so a restart starts with nothing unseen. That is cheap to change later.
- [deferred] Operating-system desktop notifications → safe to defer. The in-app toast and the status bar cover the cockpit-open case; OS notifications would need settings and focus handling, and belong in a separate ticket.
- [resolved] Time zone of log timestamps → assumption: the CLI writes local time with no zone, and the cockpit shows it as written. Entries without a time ("2026-10-30 created") sort as the start of that day.
