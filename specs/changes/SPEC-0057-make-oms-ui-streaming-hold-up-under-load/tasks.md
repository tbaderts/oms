# Tasks — SPEC-0057: Make oms-ui streaming hold up under load

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

No contract or migration tasks: the change touches no OpenAPI, Avro or database schema (design →
Contract Changes, Data & Persistence).

### oms-streaming-service

- [x] **T-1** Add `StreamFilter.snapshotLimit` (validated: ≤ 0 → 0, clamped to 100,000) and `snapshotTotal` plus the `snapshotEnd(total)` factory on `OrderEvent` and `ExecutionEvent`; test first (AC-3)
  - files: oms-streaming-service/src/main/java/org/example/streaming/model/StreamFilter.java, oms-streaming-service/src/main/java/org/example/streaming/model/OrderEvent.java, oms-streaming-service/src/main/java/org/example/streaming/model/ExecutionEvent.java, oms-streaming-service/src/test/java/org/example/streaming/model/StreamFilterTest.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.model.StreamFilterTest'` passes
- [x] **T-2** Add `OmsQueryClient.fetchOrderSnapshot(filter, limit)` returning rows (newest first, stops paging at the limit) and the matching count from the first page; write `OmsQueryClientTest#fetchOrderSnapshot_stopsAtLimitAndReportsMatching` first with a stub `ExchangeFunction` (AC-3)
  - files: oms-streaming-service/src/main/java/org/example/streaming/client/OmsQueryClient.java, oms-streaming-service/src/test/java/org/example/streaming/client/OmsQueryClientTest.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.client.OmsQueryClientTest'` passes
- [x] **T-3** Bound the order snapshot and end it with `SNAPSHOT_END` carrying the matching count, including the cache fallback; write `KafkaEventStreamProviderTest#orderSnapshotIsLimitedAndEndsWithMatchingCount` first and update `snapshotDeduplicatesLiveEventsPerOrderByVersion` for the marker (AC-3)
  - files: oms-streaming-service/src/main/java/org/example/streaming/service/KafkaEventStreamProvider.java, oms-streaming-service/src/test/java/org/example/streaming/service/KafkaEventStreamProviderTest.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.service.KafkaEventStreamProviderTest'` passes
- [x] **T-4** Replace `getExecutionEventStream(boolean)` with `getExecutionEventStream(StreamFilter)`: filter inside the provider, newest by `transactTime`, limited, `SNAPSHOT_END`, live only without a snapshot; route `executions.stream` through it; write `executionSnapshotIsNewestByTransactTimeAndEndsWithMatchingCount` and `executionStreamWithoutSnapshotSendsOnlyLiveEvents` first (AC-3, AC-4)
  - files: oms-streaming-service/src/main/java/org/example/streaming/service/EventStreamProvider.java, oms-streaming-service/src/main/java/org/example/streaming/service/KafkaEventStreamProvider.java, oms-streaming-service/src/main/java/org/example/streaming/controller/TradeBlotterController.java, oms-streaming-service/src/test/java/org/example/streaming/service/KafkaEventStreamProviderTest.java
  - verify: `cd oms-streaming-service && ./gradlew test --tests 'org.example.streaming.service.KafkaEventStreamProviderTest' --tests 'org.example.streaming.controller.TradeBlotterExecutionStreamTest'` passes
- [x] **T-5** Bound what one slow subscriber holds: `onBackpressureBuffer(streaming.subscriber.max-pending, ERROR)` on the live part of both streams, WARN log and `oms_streaming_subscriber_overflow_total{route}`; write `slowSubscriberOverflowEndsTheStream` first (AC-6)
  - files: oms-streaming-service/src/main/java/org/example/streaming/service/KafkaEventStreamProvider.java, oms-streaming-service/src/main/resources/application.yml, oms-streaming-service/src/test/java/org/example/streaming/service/KafkaEventStreamProviderTest.java
  - verify: `cd oms-streaming-service && ./gradlew test` passes

### oms-ui

- [x] **T-6** Add `RowStore` (LRU put, delta against grid keys, bounded dirty set, snapshot mode keeping the newest `cap` and inserting oldest first); write `rowStore.test.ts` first; remove `rollingWindow.ts` and its test once unused (AC-2, AC-5, AC-7)
  - files: oms-ui/frontend/src/services/rowStore.ts, oms-ui/frontend/src/services/rowStore.test.ts
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/services/rowStore.test.ts` passes
- [x] **T-7** Request events in bounded batches (256, replenish 128 after each 128 processed) for orders and executions; add `snapshotLimit` to `convertToStreamFilter` and the stream types (`SNAPSHOT_END`, `snapshotTotal`); write "requests events in bounded batches" first (AC-6)
  - files: oms-ui/frontend/src/services/RSocketStreamingService.ts, oms-ui/frontend/src/services/RSocketStreamingService.test.ts, oms-ui/frontend/src/types/streaming.ts
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/services/RSocketStreamingService.test.ts` passes
- [x] **T-8** Feed the grid from the row store with one delta transaction per frame (`frameScheduler`), one state update per flush, no `rowData`; flush on grid ready; write "applies a frame's events as one delta transaction" first and adapt the existing StreamingBlotter tests to the transaction-fed grid (AC-1)
  - files: oms-ui/frontend/src/services/frameScheduler.ts, oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx, oms-ui/frontend/src/services/rollingWindow.ts, oms-ui/frontend/src/services/rollingWindow.test.ts
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/components/StreamingBlotter.test.tsx` passes
- [x] **T-9** Send `snapshotLimit = maxRows`, buffer snapshot rows until `SNAPSHOT_END` (or the first live event) and add them in one transaction; performance marks `oms:subscribe` / `oms:snapshot-shown` and the `oms:snapshot` measure; write "adds the snapshot in one transaction at its end" first (AC-5, AC-11)
  - files: oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/components/StreamingBlotter.test.tsx` passes
- [x] **T-10** Pause/Resume button and hidden-as-paused: no transaction while held, "Paused — N updates pending", one catch-up transaction on release or activation; write "pause holds the grid and resume applies the latest state" and "a hidden blotter catches up when shown" first (AC-7)
  - files: oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx, oms-ui/frontend/src/components/Blotter.scss
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/components/StreamingBlotter.test.tsx` passes
- [x] **T-11** "Showing N of M" in the info bar: M = snapshot total + live orders with `eventId` 1 + live fills; "Showing N" without a snapshot; write "shows N of M" first (AC-8)
  - files: oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/components/StreamingBlotter.test.tsx` passes
- [x] **T-12** Load harness: `streamingService` and `onFlush` props on `StreamingBlotter`, `SyntheticStreamingService`, `LoadHarness` page lazy-loaded on `?loadHarness`, `metrics.ts` report; write `metrics.test.ts` (percentiles, long tasks after 1 s, heap minimum per minute) first (AC-9, AC-10)
  - files: oms-ui/frontend/src/loadHarness/metrics.ts, oms-ui/frontend/src/loadHarness/metrics.test.ts, oms-ui/frontend/src/loadHarness/SyntheticStreamingService.ts, oms-ui/frontend/src/loadHarness/LoadHarness.tsx, oms-ui/frontend/src/App.tsx, oms-ui/frontend/src/components/StreamingBlotter.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false` passes and `npm run build` succeeds

### Knowledge base, measurement, verification

- [x] **T-13** Update the knowledge base: LRU window, frame batching, bounded bulk snapshot, Pause/Resume and hidden as paused, "Showing N of M", load harness; `SNAPSHOT_END`, `snapshotLimit`, executions `includeSnapshot`, client demand and the overflow bound
  - files: oms-knowledge-base/ui/oms-admin-ui_spec.md, oms-knowledge-base/capabilities/real-time-streaming.md
  - verify: grep finds `SNAPSHOT_END`, `snapshotLimit` and `loadHarness` in those pages
- [x] **T-14** Measure AC-9, AC-10 and AC-11 in Chrome on the production build (rebuilt `oms-ui` and `oms-streaming-service` images, agreed with the user first) and record each raw report in verification.md (AC-9, AC-10, AC-11)
  - files: specs/changes/SPEC-0057-make-oms-ui-streaming-hold-up-under-load/verification.md
  - verify: the AC-9 and AC-10 harness reports and the AC-11 `oms:snapshot:Execution` measure meet the budgets in proposal.md
- [x] **T-15** Run spec verify (agree a quiet window with other sessions first)
  - verify: `node specs/tools/spec.mjs verify SPEC-0057` exits 0

- [x] **T-16** From the independent review: late snapshot rows after the quiet fallback go to the old end (`RowStore.putOldest`) and the late `SNAPSHOT_END` still sets M; a refused transaction is put back (`RowStore.rejectLastDelta`); a hidden blotter schedules no frames; the dev SSE stream filters the marker; tests first (AC-5, AC-7, AC-8)
  - files: oms-ui/frontend/src/services/rowStore.ts, oms-ui/frontend/src/services/rowStore.test.ts, oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx, oms-streaming-service/src/main/java/org/example/streaming/controller/TestStreamController.java, oms-streaming-service/src/test/java/org/example/streaming/controller/TestStreamControllerTest.java
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false` passes (177) and `cd oms-streaming-service && ./gradlew test` passes
- [x] **T-17** Rerun spec verify after the review fixes
  - verify: `node specs/tools/spec.mjs verify SPEC-0057` exits 0

## Notes

- T-1 to T-5 (server) and T-6, T-7 (client building blocks) are independent; T-8 to T-12 build on
  T-6 and T-7 in order.
- T-8 changes how every existing StreamingBlotter test observes rows (transactions, not
  `rowData`); those tests are adapted in T-8, without weakening what they assert.
- T-14 needs the user's go-ahead to rebuild the running docker images.
- Done within T-2 to T-4, not planned (design → "Changed during implementation"):
  - `OmsQueryClient` now reads `eventVersion` (T-2);
  - executions replayed by the live sink are deduplicated against the snapshot (T-4);
  - `blotter.stream` filters out the new marker (T-4).
- Found during T-14, the first measurement on the rebuilt images:
  - **The streaming image had copied a stale jar.** Its Dockerfile copies `build/libs/*.jar`, so
    the jar must be built first: `./gradlew bootJar`, then `docker compose build streaming-service`.
  - **A snapshot without an end marker could stay hidden.** The new UI against the old server
    showed nothing until a live event arrived. Now a snapshot counts as complete once no snapshot
    row has arrived for 1 s. Test first: `StreamingBlotter.test.tsx` › "shows a snapshot without
    an end marker once it goes quiet".
  - **The execution cache starts empty after a restart.** The consumer group's committed offsets
    are at the end of `oms_order_executions`. For AC-11 the group was reset to earliest, with the
    user's agreement, and the cache rebuilt to 8,218 fills. That limitation predates this ticket
    (Follow-ups).
  - **The automation Chrome window runs at about 2 frames/s.** Chrome throttles it even when in
    front, so the user runs the AC-9 and AC-10 harness pages in a tab of their own.
- **AC-9 run 2 (2026-11-10, rows drawn), fixed in `StreamingBlotter.tsx`** (design → "The grid is
  not re-rendered by the counters").
  - The run itself was valid but failed: frame p95 127 ms (`measurements/ac-9-harness-run2-fail.json`).
  - The fix: `onGridReady` and `onRowDoubleClicked` became `useCallback`, the `AgGridReact`
    element is memoised on its inputs, and `animateRows` is off. Test: "does not re-render the grid
    when only the counters change".
  - A 15 s check afterwards: frame p95 36 ms (`measurements/ac-9-harness-15s-after-fix.json`). It
    is not the 60 s AC-9 evidence.
- **SPEC-0058 has since changed the same file and the grid's look** (2026-11-10).
  - Inside the memoised element: `autoSizeStrategy` fitGridWidth, plus `onGridSizeChanged` and
    `onNewColumnsLoaded` refitting the columns. These are module constants, so the memo's inputs
    are unchanged.
  - The `rowHeight`/`headerHeight` overrides are gone, so rows are the theme's 30 px (was 28).
  - Toolbar icons, the detail modal's badges and the stylesheets on the new tokens.
  - `onGridReady` no longer calls `autoSizeAllColumns`.
  - So AC-9 and AC-10 must be measured on a build that includes SPEC-0058. Both tickets' changes
    share `StreamingBlotter.tsx` and should be committed together or in order (0057, then 0058).
