# Verification — SPEC-0071: Stream orders and executions without service caches

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

From the final `spec verify` (2026-11-24, third run): oms-streaming-service reports in
`build/test-results/test` — `KafkaEventStreamProviderTest` 12/12, `OmsQueryClientTest` 5/5,
`ExecutionMessageMapperTest` 3/3, `KafkaConfigTest` 2/2, `TradeBlotterControllerRoutesTest` 1/1,
`MetadataControllerStatusTest` 1/1, `StreamedFieldsTest` 1/1, no failures or skips (the module was
up to date in the final run; these reports are from the second run, unchanged inputs); oms-ui jest
237/237 (evidence/oms-ui-1.log).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Execution snapshot from the search: newest matching, limited, `symbol`, count = `totalElements` | `OmsQueryClientTest#fetchExecutionSnapshot_pagesTheSearchAndCountsMatches` (path, `sort=id,DESC`, pages stop at the limit, filter as query params, matching = totalElements), `#fetchExecutionSnapshot_mapsStoredFills` (fields incl. `symbol`); `KafkaEventStreamProviderTest#executionSnapshotComesFromTheSearchAndEndsWithItsCount` | PASS |
| AC-2 | A deleted fill is not in the next snapshot, no restart | `KafkaEventStreamProviderTest#executionSnapshotIsReadAtEachSubscription` (second subscription reads again; the removed fill is absent) | PASS |
| AC-3 | Live from `oms_executions` with execution fields; nothing from `oms_order_executions` | `KafkaEventStreamProviderTest#liveExecutionsComeFromTheExecutionRecord`, `#liveFillsAreFilteredOnTheirInstrumentAndStatus`; `ExecutionMessageMapperTest`; `KafkaConfigTest#executionReceiverReadsOmsExecutionsFromLatest` (the only fills receiver subscribes to `oms_executions`, `latest`); `StreamedFieldsTest` | PASS |
| AC-4 | Live fill at ≤ snapshot version dropped, higher emitted | `KafkaEventStreamProviderTest#liveFillAtOrBelowTheSnapshotVersionIsNotEmitted` | PASS |
| AC-5 | oms-core down → snapshot subscription errors; live-only works | `KafkaEventStreamProviderTest#snapshotFailsWhenOmsCoreFails` (orders and executions), `#liveOnlyStreamNeedsNoOmsCore` (`verifyNoInteractions`) | PASS |
| AC-6 | Removed routes have no handler; no cache sizes; no startup call to oms-core | `TradeBlotterControllerRoutesTest#onlyTheUsedRoutesRemain` (exactly `orders.stream`, `executions.stream`, `health`); `MetadataControllerStatusTest#statusHasNoCacheSizes`; `KafkaEventStreamProviderTest#startupCallsNoOmsCore` | PASS |
| AC-7 | Bare execution row shows its fields; no `subscribeToBlotter` | `StreamingBlotter.test.tsx` › "shows the fields of a bare execution and counts a redelivery once"; `RSocketStreamingService.test.ts` › "offers no blotter.stream subscription" | PASS |

## Goal Assessment

The Goal: oms-ui should use only order and execution data, not the booking projection; the
streaming service's cache looked like a leftover — is it needed?

- **The cache is gone, and nothing needed it.** Each snapshot is read from the database through
  the query API when a subscription asks for it. Live data comes from `oms_orders` and
  `oms_executions`. Deduplication is per subscription (by version) plus the UI's upsert by key.
- **oms-ui no longer touches the projection.** The live blotter's execution snapshot comes from
  the execution search over `executions` (SPEC-0070). Its live fills come from `oms_executions`,
  the fill with its instrument (SPEC-0069). The REST blotter reads the same search. Nothing in
  oms-ui or oms-streaming-service reads `/api/query/executions` or `oms_order_executions` (checked
  by the reviewer).
- **The original symptom is fixed.** A fill deleted from the database is not shown by the next
  subscription (AC-2), with no restart. That was the case on 2026-11-24 that started this work.
- **Out of scope, on purpose:** the projection and `oms_order_executions` stay for booking and
  downstream systems. `mission-control` still reads `oms_order_executions`; it is a separate tool,
  noted under Follow-ups.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | No contract change |
| P-02 | Specification before code, generated models only | PASS | Uses the generated `Execution` and the specified execution search |
| P-03 | Never edit generated code | PASS | None touched |
| P-04 | Contracts evolve compatibly | PASS | No contract change; RSocket route removal declared BREAKING in the approved proposal |
| P-05 | Every state change is recorded in the event log | N/A | No order state changes |
| P-06 | Kafka only through the transactional outbox | N/A | Consumer only |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | PASS | Per-subscription version check (AC-4); UI upserts by key and counts a held key once (AC-7) |
| P-09 | Commands and queries stay separate | PASS | Reads via the query API only |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transitions |
| P-11 | Layering and conventions | PASS | Client → provider → controller; new mapper beside the order mapper |
| P-12 | Jackson 3 only | PASS | `tools.jackson` in client and tests; policy check auto rule passed |
| P-13 | Errors and validation follow the framework specs | PASS | Snapshot errors reach the subscriber; nothing swallowed (`onErrorResume` removed) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC above, including the status endpoint (added after review) |
| P-15 | Observability | PASS | Snapshot logs kept; overflow metric kept; `withObservation` on the new receiver |
| P-16 | Security | PASS | No new input surface |
| P-17 | Simplicity and dependencies | PASS | Net removal of state, routes and settings; no dependency. Unused `OmsQueryClient.fetchAllOrders`/`fetchOrdersWithFilter`/`fetchOrders` predate this ticket → Follow-ups |
| P-18 | Modules build standalone | PASS | `spec verify`: oms-streaming-service, oms-ui (both commands) exit 0 |
| P-19 | Documentation follows behaviour | PASS | KB: streaming-service, real-time-streaming, event-streaming, query-api, message-api topic table, target-architecture, log; streaming README, FILTERED_STREAMING.md, root and oms-ui READMEs; okf-check 0 errors |

## Independent Review

spec-reviewer ran during the first verify. Findings:

1. **[blocking] Filtered live executions dropped every fill.** `FilterService` did not know
   `symbol`, `securityId` or `status`, so a stream filtered on them showed the right snapshot (the
   search applies the filter) and then no live fill. **Fixed, test first:** the accessors gain
   `symbol`, `securityId`, `status`, `orderVersion`; `ExecutionDto` gains `status` (from the search;
   live from the ExecType: H busted, G corrected, else applied); oms-ui streams `status`
   (`#liveFillsAreFilteredOnTheirInstrumentAndStatus`, `ExecutionMessageMapperTest#statusFollowsTheExecType`).
   Two oms-ui tests that used `status` as their history-only example were updated.
2. **[major] KB topic table had the streaming consumers the wrong way round.** **Fixed**
   (`message-api.md`).
3. **[minor] Stale references** in `target-architecture.md`, the streaming README,
   `FILTERED_STREAMING.md`, the root and oms-ui READMEs. **Fixed.**
4. **[minor] Status endpoint untested.** **Fixed:** `MetadataControllerStatusTest`.
5. **[minor] `MetamodelService` comment named the deleted `OrderExecutionMapperTest`.** **Fixed.**
6. **[minor] T-2 unticked; verification pending.** **Fixed** (T-2's verify had passed; ticked) and
   this document.

## Automated Evidence

`evidence/last-run.json`: result `pass`; policy check PASS. Commands, all exit 0:
oms-streaming-service `gradlew check`, oms-ui `npm test` (237/237) and `gradlew check`.
Earlier runs: the first passed before the review; the second failed on the four oms-ui tests that
pinned `status` as not streamed (fixed above).

## Follow-ups

- `mission-control` reads `oms_order_executions`; if it only needs fills, it could read
  `oms_executions` like the blotter. Not filed yet.
- Unused `OmsQueryClient` order methods (`fetchAllOrders`, `fetchOrdersWithFilter`, `fetchOrders`)
  predate this ticket and could be removed.
- With SPEC-0069, SPEC-0070 and SPEC-0071 done, the requester's cleanup is complete; the remaining
  item from SPEC-0070's follow-ups is the `/api/orders` half of TD-3.

## Verdict

Verdict: GOAL MET
