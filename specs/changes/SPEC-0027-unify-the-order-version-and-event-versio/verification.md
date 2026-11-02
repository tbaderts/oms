# Verification — SPEC-0027: Unify the order version and event version

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The final `spec verify` ran at 2026-11-02 07:42Z, after the review fixes of T-7. It ran
`gradlew check` in oms-core: 282 tests, no failures, no skips. Every test named below is in that
run. Log: `evidence/oms-core-1.log`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | After each command (REST and Kafka) `txNr` = the version just appended; outbox and published messages carry it | `OrderVersionIntegrationTest#txNrIsTheLatestEventVersionAfterEveryCommand`: create (REST), accept (Kafka), fill (REST), fill (Kafka), cancel request (REST), cancel (Kafka). After each, `txNr` equals the latest event version: 1, 2, 3, 4, 5, 6. The `OrderMessage`s on `orders` carry exactly the `eventId`s {1..6}. The existing `txNr` delta assertions in `ExchangeWorkflowIntegrationTest` (14) and `EventSourcingIntegrationTest` (9) still hold | PASS |
| AC-2 | No `max(version)` query per event | `OrderEventAppenderTest#appendsTheOrdersNextVersionWithoutQuerying`: version = `txNr + 1`, set on the order and the snapshot, and the event repository is used only for `saveAndFlush` (`verifyNoMoreInteractions`). `OrderEventRepository.findMaxVersionByOrderId` is deleted | PASS |
| AC-3 | Two concurrent commands: exactly one applied; the other fails whole as a conflict (409 / Kafka retry); both apply only after the retry | `OrderVersionIntegrationTest`: `#concurrentFillsThroughThePipelineOneWaitsThenFails` runs two fills through `ExecutionCommandProcessor`. B is blocked on A's uncommitted event, then fails with a `ConcurrencyFailureException`, leaving no execution and no event. Its retry applies, `cumQty` 10 → 30, and the versions stay contiguous. `#kafkaFillRetriedAfterAConflict`: a Kafka fill meets a concurrent version, its attempt fails and is retried, and it applies once the conflict is gone. `#fillConflictingWithAConcurrentWriterIsRethrownNotRefused`: REST 409 `concurrent-modification`, nothing applied. `#concurrentWritersAppliedOnceThenRetried`. Unit: `OrderEventAppenderTest` (version conflict → `OptimisticLockingFailureException`; other violations propagate), `PipelineResultsTest` (optimistic and lock failures rethrown), `CommandControllerWebMvcTest#lifecycleCommand_lockFailure_returns409Retryable` | PASS |
| AC-4 | Migration: `tx_nr` = highest event version (0 without); next command follows with no gap or duplicate | `UnifiedOrderVersionMigrationIntegrationTest#migrationSetsTxNrToTheLatestEventVersion` (migrated from the tag before 010): 7 with events 1–3 → 3; 5 without events → 0; 2 with a gapped log 1, 2, 5 → 5. Appending to the first gives version 4 | PASS |
| AC-5 | Query API: `txNr` = `eventVersion`; absent without events; no query on `order_events` | `QuerySearchVersionIntegrationTest#search_readsTheVersionFromTheOrderWithoutQueryingTheEventLog`: `txNr` 4 = `eventVersion` 4, `eventVersion` absent at version 0, and `verifyNoInteractions` on the event repository (a spy). `OrderVersionIntegrationTest#queryApiReportsTxNrEqualToEventVersion`; `ExchangeWorkflowIntegrationTest#queryApi_reportsTheLatestEventVersion`. The proposal named `GET /orders` and `GET /orders/{id}`; the query API's only order read is `GET /api/query/search`, which these tests use | PASS |
| AC-6 | Replay equals the stored order, version included | `OrderReplayServiceTest#replaySetsTheVersionFromTheEvent` (a legacy snapshot's counter is replaced by the event's version, on a copy). In `#txNrIsTheLatestEventVersionAfterEveryCommand`, replay after the sequence equals the row's `txNr`, state, cancel state and quantities | PASS |

## Goal Assessment

The Goal asked for three things, all delivered:
- the event version becomes the order's version;
- the appender sets it on the order;
- the per-event max query goes away.

The `@Version` sequence is gone; `tx_nr` now holds the event version. The query API also lost its
per-page version query.

Concurrency is preserved by a different mechanism, which was approved at the proposal stage: the
event log's unique version. Implementation and review showed that the conflict now surfaces inside
the task pipelines. Two fixes followed:
- `PipelineResults` rethrows any concurrency failure, optimistic or lock/deadlock.
- The 409 handler covers them all.

Without them, a losing Kafka command would have been acknowledged as a refusal and lost.

One operational rule follows from the change: all old instances must be stopped before the
migration. It is documented in the changelog and in `domain/order.md`. The value of `txNr` in the
query API is one higher than before (approved). No material gap.

## Policy Review

Reviewed against the diff of the SPEC-0027 files (tasks.md lists them, with its Notes). The working
tree also holds uncommitted work of earlier, finished tickets. The R10 warnings of the policy check
come from SPEC-0025's files.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract change |
| P-02 | Specification before code, generated models only | N/A | No API or message change |
| P-03 | Never edit generated code | N/A | None involved |
| P-04 | Contracts evolve compatibly | PASS | No shape change. The value of `txNr` is documented (`interfaces/query-api.md`); `eventId`/`orderVersion` unchanged |
| P-05 | Every state change is recorded in the event log | PASS | Every write of `orders` is followed by an append in the same transaction (create, accept, fill, lifecycle; confirmed by the review); the row now names its event |
| P-06 | Kafka only through the transactional outbox | PASS | Outbox rows unchanged; `aggregateVersion` = the order's version |
| P-07 | Schema changes through new Liquibase changesets | PASS | `010-unify-order-version.yaml` (021 tag, 022 update), included last; 001–009 untouched |
| P-08 | Concurrency and idempotency are explicit | PASS | Optimistic concurrency through the unique `(order_id, version)`, flushed in the appender; every `ConcurrencyFailureException` is rethrown from the pipelines → 409 / Kafka retry; the lifecycle row lock is kept; AC-3 tests |
| P-09 | Commands and queries stay separate | PASS | The query side reads the row; no command logic |
| P-10 | State transitions go through the state machine and task pipeline | PASS | No transition changes |
| P-11 | Layering and conventions | PASS | Appender, entity, repository and query service; `PipelineResults` beside the processors |
| P-12 | Jackson 3 only | N/A | No Jackson use |
| P-13 | Errors and validation follow the framework specs | PASS | Conflicts keep the 409 `concurrent-modification` problem (now for lock failures too); `error-handling.md` updated |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC above; new tests red first, including the review fixes |
| P-15 | Observability | PASS | Conflicts logged by the handler; Kafka failed attempts counted (`oms.commands.consumed`) |
| P-16 | Security | N/A | No exposure change |
| P-17 | Simplicity and dependencies | PASS | Removes a counter and two queries; no dependency |
| P-18 | Modules build standalone | PASS | oms-core `check` in verify |
| P-19 | Documentation follows behaviour | PASS | `domain/order.md` (with the upgrade rule), `domain/order-event.md`, `domain/outbox-message.md`, `domain/glossary.md`, `interfaces/query-api.md`, NFR-002, `error-handling.md`, the convergence assessment, `oms-core/docs/architecture-specification.md`; okf-check reports 0 errors and 0 warnings |

## Independent Review

**Round 1 (NOT MET).**
- **[blocking]** A deadlock or lock failure between a fill and a lifecycle command (row lock)
  surfaced inside the pipeline. It was not an `OptimisticLockingFailureException`, so it came back
  as a refusal, acknowledged on Kafka. **Fixed:** `rethrowConcurrencyFailure` (any
  `ConcurrencyFailureException`) and the 409 handler on the superclass, with tests.
- **[major]** The AC-3 test was a stand-in, not two fills through the pipeline, and had no Kafka
  retry. **Fixed:** the two-fill pipeline race with a proven wait, and the Kafka retry test.
- **[minor]** Rolling-deploy hazard. **Fixed:** upgrade rule documented.
- **[minor]** Stale `architecture-specification.md` and `error-handling.md`. **Fixed.**
- **[minor]** NFR-002 overstated the guarantee. **Fixed:** true now.
- **[minor]** The constraint was detected by message text. **Fixed:** Hibernate constraint name
  first.
- **[minor]** No gapped-log migration case. **Fixed:** added.
- **[minor]** The REPEATABLE_READ removal was not in the design. **Fixed:** recorded.
- **[process]** verification.md was unfilled. Done.

**Round 2 (MET).** Two minor findings, both follow-ups:
- No end-to-end test of a fill against a cancel holding the row lock. The fix is by exception type
  and covered by unit and WebMvc tests.
- The loser's absence of an outbox row is implied, not asserted. It is written in the same
  transaction after the failed event insert; the relay also drains the outbox in these tests.

## Automated Evidence

`evidence/last-run.json`, ran 2026-11-02T07:42:44Z, result **pass**, fingerprint
`f1db0bf13cbad573`. Policy check: PASS, no errors. The three R10 warnings concern SPEC-0025's
files.

| Module | Command | Exit | Log |
|---|---|---|---|
| oms-core | `gradlew check` | 0 (282 tests) | evidence/oms-core-1.log |

Earlier attempts failed on shared test data: a recreated order's leftover events, and fill events
without executions or snapshots seen by the projection rebuild. Both were fixed in the tests
(tasks.md Notes).

## Follow-ups

- Add an integration test of a fill racing a cancel that holds the row lock (deadlock path) end to
  end (review round 2).
- In the AC-3 tests, assert the loser left no outbox row, for example with the relay paused
  (review round 2).
- **Before deploying,** stop every old oms-core instance, then let the 010 migration run.
- Consider renaming `txNr` to `version` in a future major version of the query API.

## Verdict

Verdict: GOAL MET

All six ACs pass with tests from the final verify run. The independent review's final verdict is
MET, and the round-1 blocking and major findings are fixed and re-verified. The goal assessment has
no material gap.
