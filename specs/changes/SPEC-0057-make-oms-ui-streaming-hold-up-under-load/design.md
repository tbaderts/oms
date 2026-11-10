# Design — SPEC-0057: Make oms-ui streaming hold up under load

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

**oms-ui today** (`oms-ui/frontend/src`):
- `components/StreamingBlotter.tsx` holds rows in React state, `dataMap: Map<key, row>`.
  `handleOrderEvent` / `handleExecutionEvent` copy the map on every event, call
  `services/rollingWindow.evictOldest` (evicts by first insertion), and call `setEventCount` and
  `setLastEventTime`. `data = Array.from(dataMap.values())` is passed as `rowData` to
  `AgGridReact`, so every event replaces the grid's rows and renders the component three times.
- The `active` prop (SPEC-0056) only gates saving state; a hidden blotter keeps rendering.
- `services/RSocketStreamingService.ts`: `subscribeToOrders` / `subscribeToExecutions` call
  `sub.request(2147483647)`. `convertToStreamFilter(filters, includeSnapshot)` builds the
  `StreamFilter` JSON (`types/streaming.ts`). `OrderEvent` / `ExecutionEvent` types mirror the
  server models.
- `services/rowId.ts` gives the row key (`orderId`; `orderId/execId` for executions).

**oms-streaming-service today** (`src/main/java/org/example/streaming`):
- `controller/TradeBlotterController`: `orders.stream` → `EventStreamProvider.getOrderEventStream
  (StreamFilter)`. `executions.stream` → `getExecutionEventStream(true)` and only then
  `.filter(filterService.createExecutionEventPredicate(filter))`. So `includeSnapshot` is ignored,
  and the predicate drops any event without an `execution` (it would drop a marker).
- `service/KafkaEventStreamProvider.getOrderEventStream`: snapshot from
  `client/OmsQueryClient.fetchOrdersWithFilter` (pages of 500, `sort=id,DESC`, every page via
  `expand`), cached, then `concatWith` the live sink, deduplicated per order on `eventId`
  (SPEC-0018). Falls back to `orderCache` if oms-core is down.
- `getExecutionEventStream(boolean)`: snapshot is `executionCache.values()` (a
  `ConcurrentHashMap`, unordered, at most `streaming.buffer.max-size`, default 10,000), then the
  live sink.
- Live sinks are `Sinks.many().replay().limit(100)`.
- `model/OrderEvent`, `ExecutionEvent`, `StreamFilter`: Lombok/Jackson DTOs, the RSocket JSON
  payloads. They are hand-written in this module, not OpenAPI or Avro.

**Closest examples followed:** the SPEC-0018 snapshot-then-live merge and its
`KafkaEventStreamProviderTest`; the SPEC-0054 rolling window and its tests in
`StreamingBlotter.test.tsx`; the SPEC-0056 `active` prop.

**Read:** `oms-knowledge-base/ui/oms-admin-ui_spec.md` (Blotter Data Modes),
`oms-knowledge-base/capabilities/real-time-streaming.md`, `oms-framework/testing-patterns.md`.

## Approach

```mermaid
sequenceDiagram
  participant UI as StreamingBlotter
  participant Store as RowStore
  participant Svc as RSocketStreamingService
  participant S as oms-streaming-service
  UI->>Svc: subscribe(filter, snapshotLimit = maxRows)
  Svc->>S: REQUEST_STREAM + request(256)
  S-->>Svc: SNAPSHOT rows (newest first, ≤ limit)
  S-->>Svc: SNAPSHOT_END {snapshotTotal}
  Svc->>Svc: request(128) every 128 processed
  Svc-->>UI: onNext(event)
  UI->>Store: put(key, row)  (snapshot rows buffered until SNAPSHOT_END)
  UI->>UI: schedule one flush per frame (unless paused or hidden)
  UI->>Store: takeDelta() → {add, update, remove}
  UI->>UI: gridApi.applyTransaction(delta); one setState for counters
```

### oms-ui

1. **`services/rowStore.ts` (new, replaces `rollingWindow.ts`).** A plain class, no React:
   - `rows: Map<string, T>` in least-recently-updated order. `put(key, row)` deletes then sets
     the key, so an update moves it to the newest end; it then evicts from the front while
     `size > cap` (AC-2).
   - Delta tracking against what the grid holds: `gridKeys: Set<string>` and
     `dirty: Set<string>`. `put` and eviction mark the key dirty. Eviction of a key the grid does
     not hold drops it from `dirty`. So `dirty ⊆ rows ∪ gridKeys`, at most 2 × cap, however long
     the store is paused (AC-7, AC-10).
   - `takeDelta()`: for each dirty key, in `rows` and in `gridKeys` → update; in `rows` only →
     add; in `gridKeys` only → remove. It updates `gridKeys` and clears `dirty`. Add order is
     oldest first.
   - `beginSnapshot()`, `putSnapshot(key, row)`, `endSnapshot()`: snapshot rows are kept in a
     separate list, at most `cap`, ignoring later ones (the server sends newest first, so the
     newest are kept, AC-5). `endSnapshot()` inserts them reversed (oldest first), so the newest
     snapshot row is the most recently updated.
   - `clear()` for re-subscription, and `size`.
2. **`services/frameScheduler.ts` (new).** `scheduleFrame(cb)` wraps `requestAnimationFrame`,
   falling back to `setTimeout(cb, 16)`. A module, so tests replace it and flush by hand.
3. **`StreamingBlotter.tsx`.**
   - The row state moves from `useState(Map)` to a `useRef(RowStore)`. `rowData` is no longer
     passed; the grid is fed only by `applyTransaction`.
   - The event handlers call `store.put` (or `putSnapshot`) and `requestFlush()`. They set no
     React state.
   - `requestFlush()` schedules one frame callback if none is pending and the blotter is not
     *held*. Held means paused by the user, `active === false` (SPEC-0056 hidden view), or inside
     a snapshot.
   - `flush()`: `delta = store.takeDelta()`. If the grid API is not ready, it does nothing (the
     store keeps the delta). Otherwise it calls `gridApi.applyTransaction(delta)`, flashes the
     updated rows, then makes **one** state update holding `{rowCount, eventCount,
     lastEventTime, pending}` (AC-1). The counters live in refs between flushes.
   - `onGridReady` flushes, so rows received before the grid exists appear.
   - **Snapshot.** When the stream is opened with a snapshot, the store is put into snapshot
     mode. An event of type `SNAPSHOT` goes to `putSnapshot`. `SNAPSHOT_END` sets
     `snapshotTotal` and calls `endSnapshot()` plus a flush. Any other event type ends snapshot
     mode first, for a server without the marker (AC-5).
   - **Pause / Resume.** A toolbar button. While held, events still go into the store and
     `pending` counts events received since holding; the info bar shows "Paused — N updates
     pending". On release, one flush applies the delta (AC-7). A hidden blotter shows nothing,
     and catches up in one flush when `active` turns true.
   - **"Showing N of M"** in the info bar (AC-8). N is `store.size`. M is `snapshotTotal` plus
     `newSinceSnapshot`. `newSinceSnapshot` counts live order events with `eventId === 1` (an
     order's first event version: `OrderEventAppender` gives version `txNr + 1`, and a new order
     has `txNr` 0), and live execution events, since every live fill is a new row (the server
     drops redeliveries, SPEC-0019). Without a snapshot it reads "Showing N". Numbers are
     formatted with `toLocaleString('en-US')`.
   - **Performance marks** for AC-11: `performance.mark('oms:subscribe:<domain>')` when
     subscribing and `oms:snapshot-shown:<domain>` after the snapshot flush, plus
     `performance.measure('oms:snapshot:<domain>', …)` and a `console.info` with the duration.
   - A new optional prop, `streamingService?: StreamingServiceLike`, defaults to
     `RSocketStreamingService.getInstance(...)`. The load harness injects its synthetic service
     here.
   - The subscribe effect passes `snapshotLimit: maxRows` through `convertToStreamFilter`.
4. **`RSocketStreamingService.ts`.**
   - `request(n)` demand: on subscribe `request(STREAM_BATCH)` (256). After each `onNext` has
     returned (that is, after the blotter put the event into its store), it counts; every
     `STREAM_BATCH / 2` events it calls `request(STREAM_BATCH / 2)`. At most 256 events are
     outstanding (AC-6). This is the same for orders and executions.
   - `convertToStreamFilter(filters, includeSnapshot, snapshotLimit?)`.
   - Types: `StreamFilter.snapshotLimit?: number`; `OrderEvent` / `ExecutionEvent` gain
     `snapshotTotal?: number`, and `eventType` admits `'SNAPSHOT_END'`. `normalizeOrderEvent` is
     not called for the marker.
5. **Load harness (`src/loadHarness/`, new).** It is loaded lazily (`React.lazy`) only when the
   URL has `?loadHarness`, so normal users download nothing.
   - **Parameters** (all from the URL): `domain` (Order|Execution, default Order), `rate`
     (events/s), `duration` (s), `keys` (distinct rows), `maxRows` (default 2,000).
   - `SyntheticStreamingService` implements the subset of `RSocketStreamingService` the blotter
     uses. It sends no snapshot. A `setInterval(10 ms)` emits `rate / 100` events per tick,
     cycling through `keys`. Each event carries its send time.
   - `LoadHarness.tsx` renders a real `StreamingBlotter` with that service, so events go through
     the same ingestion path, and measures:
     - events sent and events applied (counted in `flush`, through an optional `onFlush`
       callback prop);
     - ingest lag per event (flush time − send time);
     - frame intervals from a `requestAnimationFrame` loop;
     - long tasks from `PerformanceObserver('longtask')`;
     - `performance.memory.usedJSHeapSize` sampled every second.
   - `metrics.ts` turns these into a report: sent, applied, lag p50/p99/max, frame p50/p95/max,
     long tasks over 250 ms after the first second, and the heap minimum per minute. The report
     is shown on the page and set on `window.__omsLoadResult`.

### oms-streaming-service

6. **`StreamFilter`** gains `Integer snapshotLimit` (null = unlimited, today's behaviour).
   **`OrderEvent` / `ExecutionEvent`** gain `Long snapshotTotal`, and a factory
   `snapshotEnd(long total)` that sets `eventType = "SNAPSHOT_END"`, `snapshotTotal` and
   `timestamp`. Jackson ignores unknown properties on both sides (`@JsonIgnoreProperties`).
7. **`OmsQueryClient.fetchOrderSnapshot(StreamFilter filter, int limit)`** returns
   `OrderSnapshot(Flux<OrderDto> rows, Mono<Long> matching)`.
   - Both come from one cached first page:
     `fetchOrdersPage(0, min(limit, 500), params).cache()`.
   - `rows` expands to later pages only while fewer than `limit` rows have been read, then
     applies `take(limit)`, with the existing `sort=id,DESC`, so newest first.
   - `matching` is the first page's `totalElements`.
   - `fetchOrdersWithFilter` and `fetchAllOrders` stay for their other callers.
8. **`KafkaEventStreamProvider.getOrderEventStream`.**
   - The snapshot uses `fetchOrderSnapshot(filter, limitOf(filter))`, where a null
     `snapshotLimit` means `Integer.MAX_VALUE`.
   - It is followed by `Mono.defer(matching).map(OrderEvent::snapshotEnd)`, so the marker carries
     oms-core's matching count.
   - The fallback from `orderCache`: filter, sort by `transactTime` descending (nulls last),
     `take(limit)`, with marker total = the filtered count.
   - Deduplication is unchanged.
9. **`EventStreamProvider.getExecutionEventStream(StreamFilter filter)`** replaces the boolean
   variant; a default `getExecutionEventStream(boolean)` keeps `blotter.stream` and
   `TestStreamController` compiling.
   - The predicate is applied inside the provider: to the snapshot and to the live events, never
     to the marker.
   - With a snapshot, it sends the cache's matching executions sorted by `transactTime`
     descending (`eventTime` when null), `take(limit)`, then `snapshotEnd(matchingCount)`, then
     live events.
   - Without a snapshot, it sends live events only (AC-4).
   - `TradeBlotterController.streamExecutions` calls it with the effective filter and no longer
     filters afterwards.
10. **A bounded buffer for slow subscribers.** The live part of both streams gets
    `.onBackpressureBuffer(maxPending, BufferOverflowStrategy.ERROR)`.
    - `maxPending` comes from `streaming.subscriber.max-pending`, default 10,000.
    - A client that stops requesting gets an overflow error instead of an ever-growing server
      buffer. The blotter shows the error, and Retry reloads with a snapshot.
    - The snapshot part is not buffered: it is pulled on demand.
    - Logged at WARN with the route and buffer size; counted by
      `oms_streaming_subscriber_overflow_total{route}`.

What Changes → where:

| Proposal bullet | Where |
|---|---|
| Updates are batched | `StreamingBlotter` flush + `frameScheduler` + `RowStore.takeDelta` |
| LRU eviction | `RowStore.put` |
| Bounded snapshot, newest first, bulk load | `StreamFilter.snapshotLimit`, `OmsQueryClient.fetchOrderSnapshot`, provider snapshot + marker, `RowStore` snapshot mode |
| `executions.stream` honours `includeSnapshot` | `getExecutionEventStream(StreamFilter)`, controller |
| Bounded `request(n)` | `RSocketStreamingService` demand; server `onBackpressureBuffer` |
| Pause/Resume, hidden as paused | `StreamingBlotter` held state, toolbar, info bar |
| "Showing N of M" | `StreamingBlotter` info bar |
| Load harness | `src/loadHarness/*`, `App.tsx` lazy route |

## Contract Changes

None in oms-contracts: no OpenAPI path or schema and no Avro schema changes. The RSocket JSON
payloads are module-local DTOs in oms-streaming-service, mirrored by hand in
`oms-ui/frontend/src/types/streaming.ts`. Additive changes:

```json
// StreamFilter (client → server), new optional field
{ "logicalOperator": "AND", "filters": [], "includeSnapshot": true, "snapshotLimit": 2000 }

// New marker event, after the last SNAPSHOT event (orders.stream and executions.stream)
{ "eventType": "SNAPSHOT_END", "snapshotTotal": 8300, "timestamp": "2026-11-09T17:00:00Z" }
```

Compatibility (P-04 in spirit):
- An old client sends no `snapshotLimit` and gets the unbounded snapshot, as today.
- An old client receives one `SNAPSHOT_END` event with no `order`: today's `handleOrderEvent`
  logs "missing orderId" and skips it.
- A new client against an old server never sees the marker; the first live event ends snapshot
  mode.

`OmsQueryClient` keeps calling the Query API with the existing `page`, `size` and `sort`
parameters.

## Data & Persistence

None — no entity, table or Liquibase change. All state is in memory: the client's row store and
the server's existing caches.

## Events & Messaging

- No `order_events`, outbox or Kafka changes (P-05, P-06). The Kafka consumers are untouched.
- RSocket stream ordering: snapshot rows, then `SNAPSHOT_END`, then live events (`concatWith`, as
  today). Live events still follow the SPEC-0018 per-order version dedup against the snapshot.
- Idempotency on the client: `RowStore.put` is keyed. A repeated event for a row replaces it,
  never duplicates it. Execution redeliveries are already dropped on the server (SPEC-0019).
- Back-pressure: the client's demand (`request(n)`) propagates over RSocket REQUEST_N frames. The
  server bounds what it holds for one subscriber (item 10).

## Domain, State & Orchestration

None — no order state machine, task pipeline or command change. Validation:
- `snapshotLimit` ≤ 0 is treated as no snapshot rows (marker only).
- Above 100,000 it is clamped to 100,000. The clamp is logged at DEBUG; a client cannot make the
  server page more than that.
- There are no new error responses. The overflow ends the stream with an error the client
  already displays.

## Alternatives & Decisions

- **Delta transactions via `applyTransaction` once per frame.** Rejected:
  - `applyTransactionAsync` alone: AG Grid batches by time, but the component would still set
    state per event.
  - Keeping `rowData` with immutable data: AG Grid would diff all 2,000 rows per frame.
  - A web worker: more machinery than the cost justifies once updates are batched.
- **The row store is a plain class, outside React state.** Rejected: a `useReducer` model, which
  re-renders per dispatch, the very cost being removed.
- **LRU via `Map` delete-then-set.** O(1) per event and keeps insertion order. Rejected: a
  timestamp per row plus sorting on eviction, which costs O(n log n).
- **Snapshot sent newest first, reversed by the client.** Keeps the server streaming page by page
  without collecting into a list. Rejected: sorting oldest-first on the server, which needs the
  whole limited set in memory first.
- **The marker as an event in the same stream.** Rejected:
  - a separate `*.snapshot` request, which adds a round trip and a race with live events;
  - counting in a response header, which RSocket streams don't have.
- **"Newest" means highest id for orders and latest `transactTime` for executions** (approved
  assumption). The order fetch already sorts by `id,DESC`. The execution snapshot comes from the
  in-memory cache, where `transactTime` is available.
- **M is counted from first versions and new fills** (approved assumption). Rejected: a client-side
  set of every key ever seen, which is unbounded memory.
- **`request(256)`, replenished by 128.** Bounded and cheap. Tuned against AC-9 if needed;
  recorded here if changed.
- **Server overflow ends the stream (ERROR).** Rejected:
  - `DROP_OLDEST`, which silently loses updates a trader may rely on;
  - an unbounded buffer, which grows server memory without limit.
- **The load harness is in the app, lazy-loaded, with no new dependency** (approved assumption,
  P-17). Rejected: Playwright or Puppeteer in the build.
- **Dependencies:** none added in either module.

### Changed during implementation

- **`OmsQueryClient` reads `eventVersion`.** Its JSON mapping never read the field, so snapshot
  orders carried no version and the SPEC-0018 per-order deduplication never applied on the real
  path. The live sink replays its last 100 events to every new subscriber. So an order created
  just before the subscription arrived both in the snapshot and as a replayed first version, and
  AC-8 would count it twice. Fixed in T-2, asserted in `OmsQueryClientTest`.
- **Replayed executions are deduplicated against the execution snapshot.** For the same reason: a
  live fill whose `(orderId, execId)` the snapshot accounted for, at the same or a lower
  `orderVersion`, is skipped. That covers every matching fill, including those beyond the limit.
  Asserted by `executionSnapshotIsNewestByTransactTimeAndEndsWithMatchingCount`, where the replay
  of A/E1 to A/E3 is not seen.
- **`blotter.stream` filters out `SNAPSHOT_END`.** The route is out of scope and keeps its shape.
  `TradeBlotterExecutionStreamTest` still passes.
- **The overflow metric's tag values are the route names**, `orders.stream` and
  `executions.stream`.
- **A snapshot without a marker ends after 1 s of quiet.** The Contract Changes section said a
  new client against an old server would end snapshot mode at the first live event. In a quiet
  market there may be none, so the grid stayed empty; this was seen on the rebuilt UI against a
  stale server image. Now, once no snapshot row has arrived for `SNAPSHOT_QUIET_MS` (1 s), the
  snapshot counts as complete. The marker or a live event still ends it at once.
- **Column definitions are stable (found by the AC-10 run).** A valid 10-minute run failed: the
  heap minimum rose 57% and frame p95 reached 97 ms.
  - Cause: each render handed AG Grid a new `columnDefs` array and a new inline `defaultColDef`. At
    one render per frame, AG Grid rebuilt its columns about 60 times a second.
  - Fix: `columnDefs` is memoised on the columns shown; `DEFAULT_COL_DEF` is a module constant.
  - Ruled out: `RowStore` stays at 4.0 MB after GC through 10 minutes of the same churn in Node, and
    the DOM stays at 329 nodes during a run.
- **AG Grid modules are registered (found on 2026-11-10 by screenshot).** oms-ui registered no AG
  Grid modules. In AG Grid 36, `api.applyTransaction` needs `ClientSideRowModelApiModule`; without
  it the call logs error #200 and does nothing.
  - The live grids showed the loading overlay, then "No Rows To Show", while the counters read 2,000
    rows.
  - The jsdom tests use a fake grid and could not see it. Every earlier measurement (AC-9, AC-10,
    AC-11) was taken on a grid that drew no rows; they are marked invalid in `measurements/`.
  - Fixes:
    - the grid gets one empty `rowData` (`NO_ROWS`, the same array on every render), then
      transactions;
    - `theme/agGridModules.ts` registers `AllCommunityModule` for both grids. That covers the
      transaction API, cell flashing, auto-size, sorting and filters. It costs 114 kB gzipped,
      chosen over a hand-picked list that fails only at run time when a feature is missing
      (follow-up: trim it to the exact modules once a check exists);
    - the blotter reports a flush to `onFlush` only when AG Grid accepts the transaction, and logs
      an error otherwise. So the harness cannot again count events the grid never showed.
- **The grid is not re-rendered by the counters (found by AC-9 run 2, 2026-11-10).** With rows
  drawn, a valid AC-9 run failed: frame p95 127 ms, p50 49 ms
  (`measurements/ac-9-harness-run2-fail.json`).
  - Cause: the blotter renders its counters once per frame. `onGridReady` and `onRowDoubleClicked`
    were new functions on every render, so `AgGridReact` re-rendered each frame and re-checked its
    options on top of drawing the transaction. Long-animation-frame entries put the React work at
    about 30 ms per frame, against about 8 ms for the flush itself.
  - Fix: both callbacks are `useCallback`, and the `AgGridReact` element is memoised on its inputs,
    so counter renders skip it. `animateRows` is off: under churn every eviction would animate every
    row below it. Test first: `StreamingBlotter.test.tsx` › "does not re-render the grid when only
    the counters change".
  - A 15 s run on the fixed build: frame p95 36 ms, p50 18 ms, lag p99 14 ms
    (`measurements/ac-9-harness-15s-after-fix.json`). Coalescing grid transactions was not needed.
- **The harness judges only valid runs.** It records the time the page was hidden, and frame gaps
  over 1 s that contain no long task (Chrome throttling the page); either makes the run invalid.
  AC-10 uses only heap samples within the run. With Chrome started with `--js-flags=--expose-gc`,
  it collects garbage every 10 s before sampling.

## Risks & Mitigations

- **AG Grid transactions with `getRowId`.** `update` and `remove` need the same ids as `add`. The
  same `rowIdOf` is used for the store key and `getRowId`. A component test asserts the
  transaction contents.
- **rAF does not run in a background browser tab.** Flushes stop, but the store stays bounded
  (`dirty` ≤ 2 × cap) and catches up on return. This is covered by the paused test.
- **Lost catch-up when grid API arrives late.** `onGridReady` flushes. Tested.
- **Replay sink and `onBackpressureBuffer` semantics.** Covered by a StepVerifier test that stops
  requesting and expects the overflow error, plus a test that a normal subscriber sees no error.
- **Measurement noise.** AC-9 and AC-10 run on the production build in Chrome with nothing else
  heavy running. Each run's raw report is pasted into verification.md, with the machine noted.
- **Hidden blotter plus StrictMode double mount in dev.** The store lives in a ref per mount and
  is cleared on re-subscribe, as today.
- **Executions predicate drops non-execution events.** The predicate moves into the provider and
  is never applied to the marker. Tested (AC-3, AC-4).

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | component (Jest) | `StreamingBlotter.test.tsx` › "applies a frame's events as one delta transaction" | 500 events, one manual frame: one `applyTransaction` with the exact add/update/remove ids, `rowData` prop never set, one commit (React `Profiler`) for the batch |
| AC-2 | unit (Jest) | `rowStore.test.ts` › "evicts the least recently updated row" | cap 3, A B C, update A, put D: B gone, order C A D; delta removes B |
| AC-3 | unit (JUnit) | `OmsQueryClientTest#fetchOrderSnapshot_stopsAtLimitAndReportsMatching`; `KafkaEventStreamProviderTest#orderSnapshotIsLimitedAndEndsWithMatchingCount`; `KafkaEventStreamProviderTest#executionSnapshotIsNewestByTransactTimeAndEndsWithMatchingCount` | stubbed Query API with 8,300 matching: 2,000 rows, newest ids, `matching` 8,300, no page past the limit; the stream emits 2,000 `SNAPSHOT` then `SNAPSHOT_END` 8,300; executions: the newest by `transactTime`, limited, with the marker total = matching cache count |
| AC-4 | unit (JUnit) | `KafkaEventStreamProviderTest#executionStreamWithoutSnapshotSendsOnlyLiveEvents`; `TradeBlotterExecutionStreamTest` still green | executions in cache, `includeSnapshot` false: first event is a live one, no `SNAPSHOT`/`SNAPSHOT_END` |
| AC-5 | unit + component | `rowStore.test.ts` › "loads the snapshot in bulk keeping the newest"; `StreamingBlotter.test.tsx` › "adds the snapshot in one transaction at its end" | no grid transaction before `SNAPSHOT_END`; then one `add` with the snapshot rows; with more snapshot rows than cap, the first (newest) are kept; a live event without a marker ends snapshot mode |
| AC-6 | unit (Jest) + unit (JUnit) | `RSocketStreamingService.test.ts` › "requests events in bounded batches"; `KafkaEventStreamProviderTest#slowSubscriberOverflowEndsTheStream` | client: first `request(256)`, then `request(128)` after each 128 processed, never 2³¹−1; server: a subscriber that stops requesting gets the overflow error after `maxPending` live events |
| AC-7 | unit + component | `rowStore.test.ts` › "stays bounded while held"; `StreamingBlotter.test.tsx` › "pause holds the grid and resume applies the latest state" and "a hidden blotter catches up when shown" | while paused: no transaction, "Paused — N updates pending", store ≤ cap; resume: one transaction with each row's latest values; same for `active` false → true |
| AC-8 | component | `StreamingBlotter.test.tsx` › "shows N of M" | marker 8,300 and 2,000 rows: "Showing 2,000 of 8,300"; three live orders with `eventId` 1: "of 8,303"; an update (`eventId` 2) does not count; no snapshot: "Showing N" |
| AC-9 | measured (Chrome) | load harness `?loadHarness&domain=Order&rate=2000&duration=60&keys=10000`, production build; report in verification.md; `loadHarness/metrics.test.ts` proves the percentile and heap computations | applied = sent, lag p99 ≤ 1,000 ms, frame p95 ≤ 50 ms, no long task > 250 ms after 1 s |
| AC-10 | measured (Chrome) | load harness `?loadHarness&domain=Order&rate=1000&duration=600&keys=20000`; report in verification.md | lowest heap in minute 10 ≤ 1.1 × lowest heap in minute 2 |
| AC-11 | measured (Chrome, local stack) | live Executions blotter on the rebuilt production image (port 8080) with ≥ 8,000 executions; `performance.measure('oms:snapshot:Execution')` read in the console | 2,000 rows shown, measure ≤ 1,000 ms |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No OpenAPI/Avro change; the RSocket JSON DTOs are module-local, as today |
| P-02 | Specification before code, generated models only | n/a | No generated model involved; the hand-written streaming DTOs are not in `org.example.common.model.*` |
| P-03 | Never edit generated code | comply | Nothing under `build/generated*` is touched |
| P-04 | Contracts evolve compatibly | comply | Payload changes are additive: optional `snapshotLimit`, `snapshotTotal`, a new event type; old clients and servers keep working (Contract Changes) |
| P-05 | Every state change is recorded in the event log | n/a | No order state change |
| P-06 | Kafka only through the transactional outbox | n/a | Nothing is published |
| P-07 | Schema changes through new Liquibase changesets | n/a | No database change |
| P-08 | Concurrency and idempotency are explicit | comply | Client store keyed by row id (repeat = replace); server dedup unchanged; per-subscriber state in the stream, no shared mutable state added |
| P-09 | Commands and queries stay separate | comply | Read-only streams; the Query API is only read |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No state transition |
| P-11 | Layering and conventions | comply | UI: pure logic in `services/`, view in `components/`, harness in its own folder; server: client/service/controller as today |
| P-12 | Jackson 3 only | comply | No Jackson 2 import; DTOs keep the existing annotations |
| P-13 | Errors and validation follow the framework specs | comply | `snapshotLimit` validated and clamped at the boundary; overflow reported as a stream error |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | AC-1 to AC-8 by tests written first; AC-9 to AC-11 are measured by the harness as the approved proposal states, with the harness's computations unit-tested |
| P-15 | Observability | comply | WARN log and `oms_streaming_subscriber_overflow_total{route}` counter on overflow; snapshot limit and matching count logged at INFO per subscription; UI performance marks |
| P-16 | Security | comply | No secrets; `snapshotLimit` bounded server-side; the harness uses synthetic data only and is loaded only by URL parameter |
| P-17 | Simplicity and dependencies | comply | No new dependency; decisions recorded above |
| P-18 | Modules build standalone | comply | oms-ui and oms-streaming-service each pass their own check; no contracts change |
| P-19 | Documentation follows behaviour | comply | KB pages below |

## Knowledge Base Updates

- `oms-knowledge-base/ui/oms-admin-ui_spec.md`, Blotter Data Modes:
  - the rolling window becomes least-recently-updated;
  - updates are batched per frame;
  - the snapshot is bounded and loaded in bulk;
  - Pause/Resume, and hidden as paused;
  - "Showing N of M" and how M is counted;
  - the load harness and how to run it.
- `oms-knowledge-base/capabilities/real-time-streaming.md`:
  - `snapshotLimit`, newest first;
  - the `SNAPSHOT_END` marker with `snapshotTotal`;
  - `executions.stream` honours `includeSnapshot` and filters inside the provider;
  - client demand in batches, and the per-subscriber overflow bound.

### Changed after the independent review

The independent review returned MET with one major hazard, now fixed test first:
- **Late snapshot rows after the quiet fallback.** The 1 s quiet fallback for servers without a
  marker can also fire against this server when one oms-core page is slow. The rows still to come
  would then have been put as live rows: newest first, so newer rows were evicted (AC-5). The late
  `SNAPSHOT_END` was ignored (no "of M", AC-8).
  - Now `endSnapshot` always takes the marker's count.
  - A snapshot row arriving after the snapshot was shown early goes to `RowStore.putOldest`: it
    takes a free slot at the oldest end and never evicts or replaces a held row.
- **A refused transaction is put back** (`RowStore.rejectLastDelta`), so the store's view of the
  grid stays true.
- **A hidden blotter schedules no frames**, as this design already said; it catches up when shown.
- **The dev SSE stream** (`TestStreamController`) filters out the marker, like `blotter.stream`.
- **Recorded, not changed.** `blotter.stream` reaches the execution stream through the default
  `getExecutionEventStream(boolean)`. It therefore also gets the per-subscriber overflow bound and
  the replay dedup, and its overflow is counted under `route="executions.stream"`.
