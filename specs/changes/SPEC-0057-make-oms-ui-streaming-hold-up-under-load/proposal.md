# Proposal — SPEC-0057: Make oms-ui streaming hold up under load

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The live (streaming) blotters in oms-ui do not hold up once many updates arrive. SPEC-0054 capped
the number of rows but not the cost per update, and SPEC-0056 left the first snapshot and hidden
blotters to this ticket. Traders and operations lose the live view exactly when the market is busy.

What happens today:
- **Every event redraws everything.** `StreamingBlotter.handleOrderEvent` copies the whole row map,
  the memoised `Array.from(dataMap.values())` rebuilds the row array, AG Grid receives all rows as
  new `rowData`, and three state setters re-render the component, once per event. Ingesting an
  8,300-event snapshot took more than 5 seconds with nothing else running (ticket Goal).
- **Eviction drops the wrong rows.** `rollingWindow.evictOldest` evicts by first insertion, and an
  update does not move a row. A busy order that keeps getting fills is evicted before a quiet one.
- **The snapshot keeps the oldest rows, not the newest.** oms-streaming-service fetches the order
  snapshot newest first (`sort=id,DESC`, every page). The client inserts in arrival order and
  evicts from the front, so once the snapshot exceeds `maxStreamingRows` (default 2,000) it is the
  newest orders that are thrown away.
- **The server sends what the client will discard.** The client requests 2³¹−1 events. The order
  snapshot pages through every matching order; the execution snapshot sends the whole execution
  cache and is sent even when the client asks for no snapshot (`executions.stream` calls
  `getExecutionEventStream(true)`).
- **Hidden blotters pay full price.** Since SPEC-0056 a hidden live blotter stays subscribed and
  keeps re-rendering its grid on every event.
- **Nothing tells the user how much they are not seeing.** With a cap of 2,000 rows and 8,300
  matching executions, the blotter shows 2,000 rows and no hint that there are more.

Doing nothing leaves the live blotter unusable at the event rates the OMS is meant to handle, and
shows a misleading subset (the oldest orders) whenever data exceeds the cap.

Related knowledge-base pages: `oms-knowledge-base/ui/oms-admin-ui_spec.md` (Blotter Data Modes,
rolling window), `oms-knowledge-base/capabilities/real-time-streaming.md` (snapshot then stream).

## What Changes

- **Updates are batched.** Events received between two frames are applied to the grid as one delta
  transaction (rows added, updated, removed), not by replacing all rows; the blotter re-renders at
  most once per batch.
- **Eviction is least-recently-updated.** An update moves a row to the newest end; the row that has
  gone longest without an update is evicted first.
- **The snapshot is bounded, newest first, and loaded in bulk.**
  - The client asks for at most `maxStreamingRows` snapshot rows (new optional `snapshotLimit` in
    the stream filter it sends). The server sends at most that many: the newest ones.
  - The server marks the end of the snapshot with a marker event that carries the number of rows
    matching on the server. The client loads the snapshot into the grid in one transaction.
  - `executions.stream` honours `includeSnapshot`.
- **The client requests events in bounded batches** (reactive-streams `request(n)`), not 2³¹−1, so
  a slow client applies back-pressure instead of buffering without limit.
- **Pause and resume.** A Pause button freezes the grid. Events keep being received into the
  bounded model, a counter shows the updates pending, and Resume applies them in one transaction.
  A hidden blotter (SPEC-0056) behaves as paused and catches up when shown.
- **"Showing N of M".** The info bar shows the rows held and the rows the server reported as
  matching, plus rows created since.
- **A load harness for measurement.** A development-only mode of oms-ui feeds synthetic events at
  a chosen rate through the same ingestion path and reports events applied, ingest lag, frame
  times, long tasks and JS heap. It is how the non-functional criteria below are measured.

No change is **BREAKING**. The RSocket JSON payloads gain optional fields and one new event type.
A client that does not send `snapshotLimit` gets today's unbounded snapshot. A client that ignores
the marker event sees one extra event it does not understand; oms-ui is the only client.

## Scope

### In scope

- oms-ui: `StreamingBlotter` ingestion (batching, delta transactions, LRU eviction, bulk snapshot
  load, bounded `request(n)`), Pause/Resume, hidden-as-paused, the "Showing N of M" indicator,
  the load harness.
- oms-streaming-service: `snapshotLimit` on `orders.stream` and `executions.stream`, the newest
  rows first, the snapshot-end marker with the matching count, `includeSnapshot` honoured by
  `executions.stream`.
- Tests for each behaviour, the measurements below, and the knowledge-base pages.

### Out of scope

- The paging (REST) blotter, and the `blotter.stream` route (oms-ui does not use it).
- Server-side throughput of oms-streaming-service, Kafka consumers or oms-core.
- Carrying more fields on the stream (SPEC-0056 follow-up).
- Persisting pause state, or pausing several blotters together.
- Virtualising columns, or changing AG Grid's own rendering settings beyond what batching needs.
- A browser automation framework in the build: the measurements are run in Chrome against the
  production build and recorded in verification.md (see Open Questions).

## Acceptance Criteria

Unit and component criteria (automated, Jest or JUnit):

- **AC-1** — Given a live blotter showing rows, when 500 events arrive before the next frame, then
  the grid receives one transaction with exactly the rows added, updated and removed, its `rowData`
  is not replaced, and the blotter renders at most once for that batch.
- **AC-2** — Given a live blotter capped at 3 rows holding A, B and C in that arrival order, when A
  is updated and then D arrives, then B is evicted and A, C and D remain.
- **AC-3** — Given 8,300 matching orders on the server and a client that subscribes with
  `snapshotLimit` 2,000, when the snapshot is streamed, then exactly 2,000 snapshot events are
  sent, they are the 2,000 newest orders (highest id), and a snapshot-end marker follows carrying
  the matching count 8,300. The same holds for executions (newest by `transactTime`).
- **AC-4** — Given a client that subscribes to `executions.stream` with `includeSnapshot` false,
  when executions exist in the server's cache, then no snapshot event is sent; only live events
  follow.
- **AC-5** — Given a live blotter receiving snapshot events, when the snapshot-end marker arrives,
  then the snapshot rows are added to the grid in one transaction, and no snapshot row is evicted
  in favour of an older one.
- **AC-6** — Given a live blotter, when it subscribes, then it requests events in batches of at most
  a configured size (not 2³¹−1) and requests more only as it processes them.
- **AC-7** — Given a live blotter that the user paused, when events arrive, then the grid's rows do
  not change, the info bar shows the number of pending updates, the model stays within the cap;
  when the user resumes, the grid shows each row's latest state in one transaction. A hidden
  blotter behaves the same way and catches up when shown.
- **AC-8** — Given the server reported 8,300 matching rows and the blotter holds 2,000, when the
  info bar is shown, then it reads "Showing 2,000 of 8,300"; when three orders are created after
  the snapshot (first event version) it reads "Showing 2,000 of 8,303". Without a snapshot it
  reads "Showing N" only.

Measured criteria (Chrome desktop, oms-ui production build, the load harness or the local stack,
results recorded in verification.md with the harness output):

- **AC-9** — Given one live blotter capped at 2,000 rows, when the harness sends 2,000 events/s for
  60 s across 10,000 distinct rows, then every event is applied (applied = sent), the 99th
  percentile ingest lag (receipt to grid transaction) is at most 1,000 ms, the 95th percentile
  frame interval is at most 50 ms, and no long task exceeds 250 ms after the first second.
- **AC-10** — Given one live blotter capped at 2,000 rows, when the harness sends 1,000 events/s for
  10 minutes across 20,000 distinct rows, then the lowest used JS heap in minute 10 is at most
  10 % above the lowest in minute 2 (memory stays flat while rows churn through the cap).
- **AC-11** — Given the local stack with at least 8,000 executions and `maxStreamingRows` 2,000,
  when the live Executions blotter subscribes with a snapshot, then 2,000 rows are shown within
  1,000 ms of the subscription, measured from the UI's performance marks (today: over 5 s for the
  full 8,300).

## Impact

| Area | Impact |
|---|---|
| Modules | oms-ui, oms-streaming-service (already set on the ticket) |
| Contracts (OpenAPI / Avro) | None. The RSocket JSON payloads defined in oms-streaming-service (`StreamFilter`, `OrderEvent`, `ExecutionEvent`) and mirrored in `oms-ui/src/types/streaming.ts` gain an optional `snapshotLimit`, a `SNAPSHOT_END` event type and a matching-count field; additive |
| Data (tables, migrations) | None |
| Events / Kafka topics | None |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui is the only RSocket client. oms-core's Query API is called with a bounded page size and the existing `sort` parameter; no API change |
| Knowledge base | `ui/oms-admin-ui_spec.md` (rolling window → LRU, batching, pause, indicator, load harness), `capabilities/real-time-streaming.md` (snapshot limit, marker, executions `includeSnapshot`) |

## Open Questions

- [resolved] **Budgets — please review at approval.** Are the numbers in AC-9 to AC-11 the right
  bar? → assumption: 2,000 events/s sustained, p99 lag ≤ 1 s, p95 frame ≤ 50 ms, no long task
  > 250 ms, heap within 10 % over 10 min, 2,000 snapshot rows shown within 1 s. They are set from
  today's baseline (about 1,600 events/s at best, 5 s for 8,300 rows), not from a stated business
  rate; change them here before approving if the business rate is known.
- [resolved] **How the measurement is run — please review at approval.** → assumption: a
  development-only load harness inside oms-ui, run in Chrome (by hand, or by an agent through
  Claude in Chrome) against the production build, with its output recorded in verification.md; no
  new dependency. Rejected for now: an automated Playwright run in the build, which adds a browser
  dependency (P-17) and CI time. If recorded manual runs are not acceptable evidence, say so and
  the design will add the Playwright run.
- [resolved] Which rows does the server send when the snapshot is limited? → assumption: the
  newest by creation for orders (`id` descending, as today's fetch already sorts) and by
  `transactTime` for executions. Least-recently-*updated* order on the server would need a sort
  the Query API may not offer; revisit if traders expect it.
- [resolved] What does Pause hold back? → assumption: only the grid. Events keep flowing into the
  bounded model, so Resume shows the current state without a new snapshot, and memory stays
  bounded. Pause does not cancel the subscription.
- [resolved] How is "M" counted after the snapshot? → assumption: the server's matching count at
  snapshot time, plus orders whose live event is their first version, plus executions not yet
  seen. Rows deleted on the server are not subtracted; the indicator is labelled as such in the
  knowledge base.
- [resolved] Batch size for `request(n)` → assumption: 256 events, replenished as each batch is
  processed; a design detail, tuned against AC-9.
