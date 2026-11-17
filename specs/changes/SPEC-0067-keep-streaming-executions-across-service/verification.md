# Verification — SPEC-0067: Keep streaming executions across service restarts

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | After a restart, the snapshot holds the newest stored fills, newest first, with execution and order fields, and `snapshotTotal` counts them | `KafkaEventStreamProviderTest#snapshotAfterStartIncludesStoredFills` (a fresh provider gives SNAPSHOT A/F2, B/F1, A/F1, then `SNAPSHOT_END 3`; a stored fill carries its order's symbol). `OmsQueryClientTest#fetchRecentExecutions_mapsFillsWithTheirOrder` (every execution field plus the nested `symbol`, `side`, `orderQty`, `price`, `account`, `state`). The client's limit is covered by the existing `executionSnapshotIsNewestByTransactTimeAndEndsWithMatchingCount` | PASS |
| AC-2 | A stored fill delivered again by Kafka is not emitted | `KafkaEventStreamProviderTest#storedFillDeliveredAgainByKafkaIsNotEmitted` (the same version is skipped; a newer version and another order pass). The check and the cache write are one atomic `compute` (`cacheUnlessSeen`), so a fill arriving during the startup load is handled the same way (review finding 3) | PASS |
| AC-3 | oms-core unreachable at startup: the service starts, streams live fills, and retries until the load succeeds | `KafkaEventStreamProviderTest#warmUpRetriesUntilQueryApiAnswers`: two failures, then success. A live fill is streamed meanwhile; three calls with limit 100 are verified; after the retry the snapshot holds the stored and live fills. The warning log on each retry (`doBeforeRetry`) is in the code but not asserted | PASS |
| AC-4 | `order=newest` returns newest first; the default and `oldest` are unchanged; an invalid value gives 400 | `ExecutionViewQueryIntegrationTest#orderNewestReturnsNewestFirst` (a2, b1, a1; `limit=2` keeps the newest), `#orderNewestUsesProjectionTimeAndBreaksTiesByStorageOrder` (an untimed fill sorts by projection time; ties by `id DESC`), `#orderOldestIsTheDefault`, `#unknownOrderIs400` (`urn:oms:error:bad-request`). The existing SPEC-0020 tests are unchanged; 8/8 pass | PASS |
| AC-5 | The load requests `min(warm-up size, cache size)` with `order=newest` | `KafkaEventStreamProviderTest#warmUpRequestsTheSmallerOfWarmUpSizeAndCacheSize` (5000 with cache 100 requests 100; 50 requests 50). `OmsQueryClientTest#fetchRecentExecutions_asksForNewestWithTheLimit` (exact URI `/api/query/executions?order=newest&limit=250`) | PASS |
| AC-6 | Stored fills are filtered in the snapshot like live ones | `KafkaEventStreamProviderTest#snapshotFiltersStoredFillsLikeLiveOnes` (`orderId=A` gives only A's fills; a `lastMkt` that nothing matches gives `SNAPSHOT_END 0`). Execution filters cover execution fields only, `account` and `symbol` not among them, "as supported today" (design.md, Changed during implementation) | PASS |
| AC-7 | `oms-contracts` build, the `oms-core` and `oms-streaming-service` checks, and `okf-check` pass | `evidence/last-run.json` (2026-11-17 10:42 UTC): pass. All five module checks exit 0, and the policy check passes. oms-core: 684 tests, 0 failures, 1 skipped (the build's test results). `okf-check oms-knowledge-base`: 205 concepts, 0 errors | PASS |

## Goal Assessment

The goal: after restarting components, the streaming execution blotter showed none of the earlier
executions, though they were stored.

The goal is met. At startup the streaming service now loads up to 5,000 of the newest stored fills,
each with its order, from the oms-core query API into its execution cache. So an executions
snapshot after a restart holds the earlier fills, as the orders snapshot always did. If oms-core
starts later, the service keeps streaming live fills and retries the load until it succeeds.

**Remaining gaps, accepted in the design:**
- A blotter that subscribes before the load finishes sees the stored fills only when it subscribes
  again. This is likely when the whole stack starts at once.
- The empty execution columns the requester also reported are out of scope (proposal).

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | The `order` parameter is only in `oms-contracts/src/main/openapi/oms-query-api.yml` |
| P-02 | Specification before code, generated models only | PASS | The spec changed first, and `ExecutionsApi` was regenerated. The streaming service maps the JSON by hand, as for orders (it generates no API models) |
| P-03 | Never edit generated code | PASS | Only the spec changed |
| P-04 | Contracts evolve compatibly | PASS | An optional parameter, default `oldest`. The default behaviour is tested (`orderOldestIsTheDefault` and the existing tests) |
| P-05 | Every state change is recorded in the event log | N/A | Read only |
| P-06 | Kafka only through the transactional outbox | N/A | Nothing is published |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change |
| P-08 | Concurrency and idempotency are explicit | PASS | `putIfNewer` (merge by `orderVersion`) during the load, and `cacheUnlessSeen` (atomic compute) on the consumer. Tested by AC-2 |
| P-09 | Commands and queries stay separate | PASS | The streaming service reads through the query API |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transitions |
| P-11 | Layering and conventions | PASS | Controller → service → repository in oms-core. Client → provider in the streaming service, as for orders |
| P-12 | Jackson 3 only | PASS | `tools.jackson.databind.JsonNode` |
| P-13 | Errors and validation follow the framework specs | PASS | An unknown `order` gives 400 through `IllegalArgumentException`. Load failures are logged and retried, not thrown into startup |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Each task's tests failed first (compile or assertion), then passed. Every AC is mapped above |
| P-15 | Observability | PASS | A warning per failed load attempt, and an info line with the count on success |
| P-16 | Security | PASS | The enum parameter goes into JPA criteria, not SQL text. No new endpoint |
| P-17 | Simplicity and dependencies | PASS | No new dependency, endpoint or index. One build change: oms-core's test heap is raised to 2 GB, recorded with its reason in design.md. It weakens no check |
| P-18 | Modules build standalone | PASS | Each module's check passes on its own |
| P-19 | Documentation follows behaviour | PASS | `architecture/context/streaming-service.md` (a new Snapshots section), `domain/interfaces/query-api.md` (`order`), `log.md`. FR-054 lists no parameters, so it is unchanged |

## Independent Review

The spec-reviewer agent's verdict was **NOT MET, only on AC-7**: at review time the latest evidence
was a failed verify run. It found nothing blocking in the code. Its findings:

1. **[major, non-blocking] Stored fills had no `eventTime`,** so a full cache evicted them in
   arbitrary order. **Fixed:** `eventTime` is the fill's `transactTime`. Tested by
   `fullCacheEvictsStoredFillsBeforeNewerLiveOnes`.
2. **[minor] The test helper called the mock and consumed the retry test's first stubbed
   answer.** **Fixed:** it checks the stubbings instead. The retry test now goes through two real
   failures and verifies `fetchRecentExecutions(100)` three times.
3. **[minor] A race between the startup load and the consumer could emit a stored fill once.**
   **Fixed:** the consumer's check and write are one atomic `compute` (`cacheUnlessSeen`).
4. **[minor] The 200 response description said "oldest first".** **Fixed.**
5. **[minor] T-5 listed FR-054, which is unchanged.** Explained in tasks.md Notes: the design made
   it conditional.
6. **[accepted risk] A snapshot taken before the load finishes misses the stored fills.** Recorded
   in design.md Risks; see Goal Assessment.
7. **[AC-4 coverage] The newest-first fallback and tie-break were not tested.** **Fixed:**
   `orderNewestUsesProjectionTimeAndBreaksTiesByStorageOrder`.
8. **[P-17 note] The 2 GB test heap may hide an unbounded test-context cache.** Accepted for now. A
   peer session (SPEC-0052) found the real cross-class problem in its own tests, replication
   workers, and fixed it. With both changes the full suite passes in about 7.5 minutes.

The review was not re-run after the fixes. The one blocking item, AC-7, is now evidenced, and each
fix has a passing test.

## Automated Evidence

`evidence/last-run.json` (2026-11-17 10:42:04 UTC): **pass**. The policy check (changes since
main, merge-base 3bf1e3bc) passes. All of these exit 0:
- `oms-contracts`, `oms-core`, `oms-streaming-service`, `oms-mcp-server` and
  `oms-exchange-simulator`: `./gradlew check`.

oms-core's test task was up to date from the full run just before, on unchanged inputs. Its
results: 684 tests, 0 failures, 1 skipped, including `ExecutionViewQueryIntegrationTest` 8/8 and
`RetentionLeadershipIntegrationTest` 1/1. Streaming: `KafkaEventStreamProviderTest` 15/15,
`OmsQueryClientTest` 5/5.

Earlier runs failed for reasons outside this ticket:
- twice with `OutOfMemoryError` at the default 512 MB test heap;
- twice on SPEC-0052's then-uncommitted `RetentionLeadershipIntegrationTest`, since fixed in that
  ticket.

## Follow-ups

- **Optional:** push stored fills to subscribers that subscribed before the startup load finished
  (design Risks).
- **Optional:** filter executions by order fields (`account`, `symbol`) in `FilterService`.
- **The empty execution columns** (Day Order Qty, Last Capacity, …) need a separate decision.
- **Deploying:** `./gradlew bootJar` in oms-core and oms-streaming-service, then
  `COMPOSE_BAKE=false docker compose up -d --build oms-core oms-streaming-service`.
- **Commit:** stage SPEC-0067's files explicitly. The tree also holds SPEC-0052's work.

## Verdict

Verdict: GOAL MET
