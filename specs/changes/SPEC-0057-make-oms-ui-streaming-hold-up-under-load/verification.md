# Verification — SPEC-0057: Make oms-ui streaming hold up under load

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Every test below ran and passed in the latest `spec verify` (2026-11-10T10:33Z):
- oms-ui: 22 suites, 177 tests (`evidence/oms-ui-1.log`);
- oms-streaming-service: `./gradlew check`, 45 tests, 0 failures (`evidence/oms-streaming-service-1.log`).

The measured criteria (AC-9 to AC-11) were taken on the current production build. It includes every
fix below and SPEC-0058, with the AG Grid modules registered, so rows were drawn. Earlier
measurements are kept in `measurements/` and marked `_invalid` or as diagnostics; none is cited as
evidence.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | A frame's events reach the grid as one delta transaction; at most one render | `StreamingBlotter.test.tsx` › "applies a frame's events as one delta transaction". 500 events, one manual frame: exactly one transaction with the expected update, remove and 290 adds. At most one React `Profiler` commit; `rowData` stays the same empty `NO_ROWS` array. Also "does not re-render the grid when only the counters change" | PASS |
| AC-2 | Least-recently-updated eviction | `rowStore.test.ts` › "evicts the least recently updated row" (A, B, C, then update A, then put D: B is evicted, order C A D) | PASS |
| AC-3 | Snapshot bounded to the newest N, ending with a marker carrying the matching count (orders and executions) | `OmsQueryClientTest#fetchOrderSnapshot_stopsAtLimitAndReportsMatching`: 2,000 of 8,300, newest first, 4 page calls, `eventVersion` read. `KafkaEventStreamProviderTest#orderSnapshotIsLimitedAndEndsWithMatchingCount` (mock bound to limit 2; `SNAPSHOT_END 8300`), `#orderSnapshotFromTheCacheIsLimitedToo`, `#executionSnapshotIsNewestByTransactTimeAndEndsWithMatchingCount` | PASS |
| AC-4 | `executions.stream` with no snapshot sends only live events | `KafkaEventStreamProviderTest#executionStreamWithoutSnapshotSendsOnlyLiveEvents`; `TradeBlotterExecutionStreamTest` green | PASS |
| AC-5 | The snapshot is added in one transaction at its end, keeping the newest | `StreamingBlotter.test.tsx`: "adds the snapshot in one transaction at its end", "a live event ends a snapshot that has no end marker", "shows a snapshot without an end marker once it goes quiet". After the review: "a late marker and late rows after the quiet fallback keep the newest rows and M". `rowStore.test.ts`: "loads the snapshot in bulk keeping the newest", "puts a late snapshot row at the old end and never evicts a newer one" | PASS |
| AC-6 | Bounded `request(n)`; a slow subscriber cannot make the server buffer without limit | `RSocketStreamingService.test.ts` › "requests %s in bounded batches" (orders and executions: 256, then 128 per 128 processed). `KafkaEventStreamProviderTest#slowSubscriberOverflowEndsTheStream`, `#subscriberThatKeepsUpIsNotCutOff` | PASS |
| AC-7 | Pause holds the grid; resume applies the latest state; hidden behaves as paused | `StreamingBlotter.test.tsx`: "pause holds the grid and resume applies the latest state", "stays within the cap while paused", "a hidden blotter catches up when shown", "a hidden blotter schedules no frames"; `rowStore.test.ts` › "stays bounded while held" | PASS |
| AC-8 | "Showing N of M" | `StreamingBlotter.test.tsx`: "shows N of M for executions", "shows N of M for orders, counting orders created since the snapshot", "shows only N without a snapshot". Also the late-marker test above | PASS |
| AC-9 | 2,000 events/s for 60 s: all applied, lag p99 ≤ 1 s, frame p95 ≤ 50 ms, no long task > 250 ms | `measurements/ac-9-harness-final.json`: the user's foreground tab, valid (hidden 0 ms, stalled 0 ms). 120,000 sent and applied; lag p99 13 ms; frame p95 30 ms; no long task over budget | PASS |
| AC-10 | 1,000 events/s for 10 min: lowest heap in minute 10 ≤ minute 2 + 10% | `measurements/ac-10-harness-final.json`: valid. 600,000 sent and applied; heap minimum 41.7 MB in minute 2 and 41.6 MB in minute 10 (0%); frame p95 36 ms | PASS |
| AC-11 | 2,000 of ≥ 8,000 executions shown within 1 s of subscribing | `measurements/ac-11-snapshot-final.json`: `oms:snapshot:Execution` 761 ms, "Showing 2,000 of 8,224". The cache was replayed to 8,224 fills, with the user's agreement | PASS |

The review fixes made after the measurements touch neither path the measurements took:
- the harness sends its marker at once, so the late snapshot rows never occur;
- the harness view is visible, so the hidden-frame change does not apply;
- with the modules registered, AG Grid never refuses a transaction.

## Goal Assessment

The goal asks for the live blotters to cope with a large number of updates, measured and not only
unit-tested. Delivered:
- **Delta transactions batched per frame.**
- **Least-recently-updated eviction.**
- **A bulk snapshot**, bounded to the newest N by the server, with the matching count.
- **Bounded demand** on the client, and a per-subscriber bound on the server.
- **Pause and Resume**, with hidden views as paused.
- **"Showing N of M".**
- **Measured results:** 2,000 events/s sustained with frame p95 30 ms; flat memory over 10 minutes;
  2,000 executions shown in 761 ms.

The work also found and fixed three problems that were older than this ticket or broke on the way:
- **The grids drew no rows with transactions**, because no AG Grid modules were registered.
- **Columns were rebuilt every render.**
- **`OmsQueryClient` ignored `eventVersion`**, so the SPEC-0018 deduplication never applied to
  real snapshots.

Gaps a requester should know:
- **The order snapshot has no time budget.** Only executions do (AC-11). In the same throttled tab,
  the order snapshot took 1,232 ms for 2,000 orders paged from oms-core, longer than the 1 s
  executions budget.
- **AC-11's timer ends when AG Grid accepts the transaction**, not at the paint, and was measured
  in the throttled automation tab, which makes the reading an upper bound.
- **The execution cache is empty after a streaming-service restart.** Its consumer group resumes at
  the committed offset, so the execution snapshot covers only fills since the restart. This
  predates the ticket.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No OpenAPI or Avro change; the RSocket JSON DTOs are module-local |
| P-02 | Specification before code, generated models only | N/A | No generated model involved |
| P-03 | Never edit generated code | PASS | Nothing under `build/generated*` touched |
| P-04 | Contracts evolve compatibly | PASS | `snapshotLimit`, `snapshotTotal` and the `SNAPSHOT_END` type are additive. Without a limit, the snapshot is unbounded. `blotter.stream` and the dev SSE stream filter the marker out. A new client without a marker uses the quiet fallback, and late rows are safe |
| P-05 | Every state change is recorded in the event log | N/A | No order state change |
| P-06 | Kafka only through the transactional outbox | N/A | Nothing published |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database change |
| P-08 | Concurrency and idempotency are explicit | PASS | The client store is keyed (a repeat replaces). The server deduplicates replayed executions against the snapshot and order events per version |
| P-09 | Commands and queries stay separate | PASS | Read-only streams |
| P-10 | State transitions go through the state machine and task pipeline | N/A | None |
| P-11 | Layering and conventions | PASS | Pure logic in `services/` (`rowStore`, `frameScheduler`); the harness in `loadHarness/`; the server's client, service and controller layers as before |
| P-12 | Jackson 3 only | PASS | `StreamFilterTest` uses `tools.jackson` |
| P-13 | Errors and validation follow the framework specs | PASS | `snapshotLimit` clamped to 0..100,000; overflow reported as a stream error |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | AC-1 to AC-8 by tests written first. AC-9 to AC-11 measured, as the approved proposal states, with the harness calculations unit-tested (`metrics.test.ts`) |
| P-15 | Observability | PASS | WARN log and `oms_streaming_subscriber_overflow_total{route}`; INFO per snapshot (limit and matching); UI performance marks `oms:snapshot:<domain>` |
| P-16 | Security | PASS | No secrets; `snapshotLimit` bounded server-side. The load harness ships as a lazy chunk opened only by `?loadHarness`. It uses synthetic data, touches no API and is not behind Authorize (low risk; noted) |
| P-17 | Simplicity and dependencies | PASS | No new dependency. `AllCommunityModule` costs 114 kB gzipped (recorded; SPEC-0060 trims it) |
| P-18 | Modules build standalone | PASS | oms-ui and oms-streaming-service each pass their own check |
| P-19 | Documentation follows behaviour | PASS | `ui/oms-admin-ui_spec.md` (LRU, batching, the memoised grid, bulk snapshot, Pause, N of M, harness) and `capabilities/real-time-streaming.md` (snapshot limit, marker, executions `includeSnapshot`, back-pressure) |

## Independent Review

The spec-reviewer returned **MET**. Its findings, all handled (T-16) before the final `spec verify`:

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | major | The 1 s quiet fallback can fire against this server when an oms-core page is slow. Late rows were then put as live, so newer rows were evicted (AC-5), and the late marker was ignored (no "of M", AC-8) | `endSnapshot` always takes the marker's count; late snapshot rows go to `RowStore.putOldest` (oldest end, never evict or replace). Tests: "a late marker and late rows after the quiet fallback keep the newest rows and M", "puts a late snapshot row at the old end and never evicts a newer one" |
| 2 | minor | A refused transaction left the store believing the grid held those rows | `RowStore.rejectLastDelta` puts the delta back; test "puts back adds, updates and removes" |
| 3 | minor | Hidden blotters scheduled frames, contrary to the design | `requestFlush` schedules none while hidden; test "a hidden blotter schedules no frames" |
| 4 | minor | `blotter.stream` gets the overflow bound and replay dedup under `route="executions.stream"` | Recorded in design.md |
| 5 | minor | The dev SSE stream emitted the marker | Filtered; `TestStreamControllerTest#sseOrderStreamHasNoSnapshotEndMarker` |
| 6 | minor | AC-11's timer ends at the grid's acceptance, not the paint | Noted in the Goal Assessment |
| 7 | minor | The harness ships in production as a lazy chunk, without Authorize | Noted under P-16 |
| 8 | process | verification.md empty, T-15 open | Completed here |

The major fix is covered by new tests that fail without it, so no second review was run.

## Automated Evidence

`spec verify SPEC-0057` ran at 2026-11-10T10:33:46Z with result **pass** (fingerprint
`f12f710422fbbf94`).

| Module | Command | Exit | Log |
|---|---|---|---|
| oms-ui | `npm test -- --watchAll=false --passWithNoTests` | 0 | `evidence/oms-ui-1.log` (22 suites, 177 tests) |
| oms-ui | `..\gradlew.bat -p .. check` | 0 | `evidence/oms-ui-2.log` |
| oms-streaming-service | `./gradlew check` | 0 | `evidence/oms-streaming-service-1.log` (45 tests) |

The policy check passed. The peer session held its edits during the runs.

## Follow-ups

- **An order snapshot time budget.** Consider one, with a larger page size or one Query API call for
  the limit (1,232 ms for 2,000 orders today).
- **Rebuild the execution cache on start.** The streaming service could replay `oms_order_executions`
  (or a bounded window of it) on start, so a restart does not empty the execution snapshot.
- **SPEC-0060:** trim `AllCommunityModule`, and the other token and formatting follow-ups.
- **Commit order.** `StreamingBlotter.tsx` carries SPEC-0057 and SPEC-0058 changes: commit them
  together, or SPEC-0057 first.

## Verdict

Verdict: GOAL MET
