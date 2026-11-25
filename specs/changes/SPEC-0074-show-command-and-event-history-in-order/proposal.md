# Proposal — SPEC-0074: Show command and event history in order detail

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The OMS is event sourced, so its full history of every order is already recorded:
- every state change is appended to `order_events`, with the command that caused it, the order
  snapshot after it, and the fields it changed (`transaction`, `order_snapshot` and the jsonb
  `changes`);
- every command received, refused ones included, is logged in `command_log`.

oms-core already serves both per order: `GET /api/query/orders/{orderId}/events` (SPEC-0049) and
`GET /api/query/orders/{orderId}/commands` (SPEC-0049). But oms-ui never calls them. Its order
detail modal (`DetailModal` → `DetailPanel`) shows only the order's current state.

So a user who wants to know how an order reached its state has two options today: query the
database, or read raw JSON from the API. Examples of such questions are why it was cancelled, which
command changed the price, who sent it, or why a replace was refused. That defeats one of the main
benefits of event sourcing, an audit trail anyone can read.

The ticket goal asks for this history in the order detail screen, with the JSON content of those
fields rendered readably.

## What Changes

- **A History view.** The order detail modal in oms-ui gets one, next to the current field view,
  for orders (not executions).
- **One timeline.** It shows the order's history oldest first, combining its event log and its
  command log:
  - each event with its version, event type, resulting state, time, source, principal and the
    causing command's type and outcome;
  - refused and failed commands, which have no event, at the point they were received, with their
    outcome and reason.
- **Readable JSON:**
  - an event's `changes` as a "field: from → to" list, with values formatted as in the detail panel;
  - the causing command (`transaction`) and the order snapshot as an indented, collapsible JSON
    tree, collapsed by default, with a copy action for the raw JSON.
- **Loaded on demand.** The history is fetched only when the History view is opened. A failed fetch
  shows an error with a retry, without breaking the rest of the modal. An order with no history
  shows an empty state.
- **No API, contract, data or message changes.** The existing query endpoints are used as they are.

## Scope

### In scope

- **The History view in oms-ui's order detail modal,** with the timeline, the JSON rendering, and
  the loading, error and empty states.
- **The UI's client calls** to the two existing query endpoints.
- **Knowledge base:** the oms-ui specification (`ui/admin-ui.md`) describes the History view.

### Out of scope

- **History of archived orders.** Since SPEC-0052, orders closed longer than the retention period
  are only on the archive replica. The blotters don't list them, so their detail can't be opened.
  Reading history from the replica belongs to SPEC-0021.
- **An execution's history.** The view is for orders. The events endpoint's `execId` filter could
  serve an execution history later.
- **Changing or replaying history from the UI:** no re-publish, rebuild or command re-submission.
- **Live updates.** The view shows the history as of when it was opened, and a refresh action
  re-fetches it. Streaming new events into an open view is not included.
- **New endpoints, filters or pagination on the query API.** An order's history is small: tens of
  events.

## Acceptance Criteria

The UI tests mock the two endpoints.

- **AC-1** — Given an order whose detail modal is open, when the user selects the History view,
  then oms-ui requests `GET /api/query/orders/{orderId}/events` and
  `GET /api/query/orders/{orderId}/commands` for that order. It lists one entry per event in
  ascending version, each showing the version, event type, resulting state, event time, source and
  principal.
- **AC-2** — Given an applied command whose `eventVersion` is n, when the History view is shown, then
  the entry for event n shows that command's type and outcome. The command does not appear as a
  separate entry.
- **AC-3** — Given a refused or failed command (no `eventVersion`), when the History view is shown,
  then it appears as its own entry, placed in time order by `receivedAt` among the events. It shows
  the command type, outcome and reason, styled so it is distinguishable from an applied change.
- **AC-4** — Given an event whose `changes` holds fields with `from` and `to` values, when its entry
  is shown, then each changed field is listed as name, old value and new value. Prices, quantities
  and timestamps are formatted with the same rules as the detail panel, and an absent old value (a
  first event) is shown as empty, not as "null".
- **AC-5** — Given an event with a `transaction` (its causing command) and an `orderSnapshot`, when
  the user expands either one, then it is shown as an indented JSON tree:
  - each key is shown with its value, and strings, numbers, booleans and null are visibly
    distinguished;
  - nested objects and arrays are collapsible, and collapsed until expanded;
  - each expandable node is a button with `aria-expanded` that toggles with the keyboard (Enter or
    Space);
  - a copy action puts the raw JSON text on the clipboard.
- **AC-6** — Given either history request fails (an HTTP error or a network error), when the History
  view is shown, then it displays an error message with a retry action. The retry repeats the
  requests, and the modal's other view still works.
- **AC-7** — Given an order with no events and no commands, when the History view is shown, then it
  displays an empty-state message rather than an empty list.
- **AC-8** — Given the order detail modal is opened, when the History view has not been selected,
  then no history request is made. Given the History view is open, when the user activates refresh,
  then the history is requested again and re-rendered.
- **AC-9** — Given the detail modal of an execution, when it is shown, then no History view is
  offered.
- **AC-10** — Given this change, when the knowledge base is read, then `ui/admin-ui.md` describes the
  History view:
  - its two sources and how they are combined;
  - the JSON rendering;
  - that it loads on demand;
  - that archived orders' history is not available there.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-ui (frontend), oms-knowledge-base. oms-core and oms-contracts are unchanged: the endpoints exist |
| Contracts (OpenAPI / Avro) | none; `getOrderEvents` and `getOrderCommands` are used as they are |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui gains the History view; no other consumer is affected |
| Knowledge base | `ui/admin-ui.md` (History view) |

## Open Questions

- [resolved] **Where the history lives in the UI** → assumption: a second view (tab) in the existing
  order detail modal, next to the current fields. That is the order detail screen the goal names, so
  no new route or screen is needed.
- [resolved] **How events and commands are combined** → assumption: one timeline.
  - An applied command is joined to the event it appended, by `eventVersion` (or `commandId` when the
    version is missing).
  - Commands without an event (refused or failed) are entries of their own, by `receivedAt`.
  - This shows each change once, with its cause, and still shows what was refused.
- [resolved] **Which jsonb content is rendered** → `changes` as a readable field diff, and the
  causing command (`transaction`) and the `orderSnapshot` as a collapsible JSON tree. Today these
  are the order history's JSON content; the command log stores no payload of its own.
- [resolved] **Is a contract change needed?** → no. The existing DTOs (`OrderEventDto`,
  `CommandLogEntryDto`) already carry every field shown. If the design finds a gap, it reopens the
  proposal.
- [resolved] **Archived orders** → out of scope (see Scope). The replica-backed history belongs to
  SPEC-0021.
