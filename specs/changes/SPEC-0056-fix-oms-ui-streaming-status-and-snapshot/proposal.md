# Proposal — SPEC-0056: Fix oms-ui streaming status and snapshot reloads

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

Three defects were observed in the running oms-ui on 2026-11-09, after SPEC-0054.

1. **The status indicator cannot be trusted.**
   - The live blotter shows "Disconnected", and offers "Connect", while events keep arriving.
   - **Cause.** All blotters share one `RSocketStreamingService` connection, a singleton. A blotter
     mounted after a tab or mode switch starts with `connectionState = 'disconnected'` and only
     listens for *future* state changes. It never reads the service's current state. The connection
     is already open, so no change comes, and the indicator stays wrong until the next reconnect.
   - **Effect.** A trader cannot tell a live view from a dead one. That is the one thing a streaming
     status must tell them.
2. **Every tab or mode switch re-downloads the whole snapshot.**
   - `App.tsx` mounts only the active blotter, so switching tabs or modes unmounts the live blotter
     and drops its rows.
   - The next mount clears its data and subscribes again with `includeSnapshot`. The server sends
     its whole snapshot (about 6,300 orders and 8,300 executions observed), only for the blotter to
     keep its rolling window of 2,000 rows.
   - A tab switch therefore costs seconds of network and CPU, and the blotter is briefly empty.
3. **Live and paging blotters can show different values for the same columns.**
   - **Observed.** The live Executions blotter showed an empty Id column, and lacked Exec Id,
     Leaves Qty and Transact Time, all of which the paging (REST) blotter shows.
   - **Reproduced on 2026-11-09 in the running app (compose oms-ui):**
     - With the default columns, with or without saved state, both blotters show the same nine
       Execution columns with values. Every default column of Order and Execution is on the stream.
     - Both blotters take their columns from the same saved state. The symptom appears when that
       state lists a column the stream does not carry. Live mode then shows that column empty.
   - **Columns the stream does not carry:**
     - Execution: `id`, `status`, `rootOrderId`, `execRefId`, `bustedAtVersion`,
       `secondaryExecID` and the three day fields;
     - Order: 25 fields, among them `id`, `txNr`, `sessionId` and the SLA timestamps.

     The column selector offers them in live mode all the same.
   - **Why `id` cannot simply be added.** It is the database surrogate. It is not on the Kafka
     records the stream is built from (`OrderMessage`, `OrderExecution`), so carrying it would be
     an Avro contract change in oms-contracts and oms-core.

## What Changes

- **The status always reflects the real connection state.** A live blotter shows the shared
  connection's current state as soon as it mounts, and every change after that. The Connect or
  Disconnect action matches the state.
- **Switching does not reload the snapshot.**
  - Switching between the Orders and Executions tabs, or between live and paging mode, keeps each
    live blotter's subscription and rows. Coming back shows the rows it had, plus the events that
    arrived meanwhile, within its rolling window.
  - A new snapshot is requested only when the user changes what is streamed: filters, the
    snapshot option, or an explicit reconnect.
- **Live mode never shows a column it cannot fill.**
  - In live mode, the column selector offers only the fields the stream carries.
  - A saved column the stream does not carry is not shown in live mode. A note in the blotter says
    which columns are history-only, and they remain in the saved state for paging mode.
  - Columns available in both modes show the same values. The default columns stay identical in
    both modes, and a test guards that.
  - Which fields are streamed comes from one list per domain object, checked by a test against the
    streaming DTOs.

## Scope

### In scope

- The connection-state wiring of the live blotters.
- Keeping live blotters' subscriptions and rows across tab and mode switches.
- Live-mode column handling (selector, hidden history-only columns, the note) for Orders and
  Executions, and a test that every default column is streamed.
- Component tests for each, and the knowledge-base page for the UI.

### Out of scope

These belong to SPEC-0057:
- update-rate performance (batched grid transactions, least-recently-updated eviction);
- bounding the server's snapshot to the newest N rows;
- pause and resume;
- the "showing N of M" indicator.

These belong to SPEC-0059: number formatting, enum labels, the default sort, keyboard support,
mode labels, and the shared toolbar.

Visual design belongs to SPEC-0058.

## Acceptance Criteria

- **AC-1** — Given the shared streaming connection is already connected, when a live blotter mounts
  (after a tab or mode switch), then it shows "Connected" and offers Disconnect, not Connect, from
  its first render after the service is ready. Given the connection then drops, then the same
  blotter shows the new state. The same holds for connecting, reconnecting and error.
- **AC-2** — Given the live Orders blotter has received its snapshot, when the user switches to
  Executions, back to Orders, to paging mode and back to live mode, then over the whole sequence
  each live blotter has requested exactly one snapshot subscription. On return, the Orders blotter
  shows the rows it had before leaving, without an empty state in between.
- **AC-3** — Given a live blotter that is not visible, when events for its domain arrive, then on
  return the blotter shows them, within its rolling window, and its event counter includes them.
- **AC-4** — Given a live blotter, when the user changes a filter, toggles the snapshot option or
  reconnects, then it subscribes again with a fresh snapshot, as before.
- **AC-5** — Given no saved blotter state, when the live and the paging Executions blotters show the
  same executions, then their column headers are identical and in the same order. Every cell that
  has a value in the paging blotter has the same value in the live blotter, Exec Id, Leaves Qty and
  Transact Time included. The same holds for the Orders blotters.
- **AC-6** — Given a saved column choice that includes a field the stream does not carry (for example
  Id or Status on executions), when the live blotter shows, then:
  - that column is not shown, and a note names it as available in History mode only;
  - the live column selector does not offer it;
  - switching to paging mode shows it, with its values, in its saved place.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-ui; oms-streaming-service only for the test that its DTOs carry every default column (set on the ticket) |
| Contracts (OpenAPI / Avro) | None |
| Data (tables, migrations) | None |
| Events / Kafka topics | None |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui only |
| Knowledge base | `ui/oms-admin-ui_spec.md` (live mode, status, switching) |

## Open Questions

- [resolved] **Keep live blotters mounted, or keep their data in a shared store?** → a design
  decision. The outcome is fixed by AC-2 and AC-3. Either keeps the subscription alive while
  hidden, which SPEC-0057's batching will make cheap.
- [resolved] **Does a hidden live blotter keep streaming?** → yes. Otherwise coming back would need
  a new snapshot (AC-3). Its cost is bounded by the rolling window, and SPEC-0057 addresses update
  rate.
- [resolved] **Fields the stream does not carry: hide them in live mode, or carry them?** → hide
  them, with a note (AC-6). This is a revision after reproducing; the first approval assumed the
  stream could simply gain the field.
  - Carrying `id` and the other 33 fields would mean new fields on the Avro `OrderMessage` and
    `OrderExecution` (oms-contracts), their mapping in oms-core and in oms-streaming-service.
  - That is a contract change worth its own ticket, if traders need those fields live. If you
    prefer that, reject this revision and say so.
