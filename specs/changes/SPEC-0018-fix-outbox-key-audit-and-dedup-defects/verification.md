# Verification — SPEC-0018: Fix outbox key, audit and dedup defects

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

`spec verify` (evidence/last-run.json) reported oms-core's `test` task as UP-TO-DATE, so the AC
tests were also run explicitly with `./gradlew test --rerun` in oms-core (36 classes, 183 tests,
0 failures, 0 skipped) and oms-streaming-service (5 classes, 19 tests, 0 failures) on the same code.
Each method below is present in `<module>/build/test-results/test/TEST-*.xml` with no `<failure>` or
`<skipped>`. Each test was read against its AC.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Both fills on `oms_executions` and the matching `oms_orders` records keyed by `orderId` | `ExchangeWorkflowIntegrationTest#fills_areKeyedByOrderIdOnBothTopics`: accept plus two fills over Kafka; reads both topics from the earliest offset; asserts exactly 2 execution and 4 order records for the order, every key = `orderId`. Red before the fix (key was `<orderId>-F1`) | PASS |
| AC-2 | REST fill → 201, its event's `transaction` is an `ExecutionCreateCmd` with the posted `execId` | `ExchangeWorkflowIntegrationTest#restFill_recordsItsCommandInTheEventLog`: POST → 201; last event is PARTIAL_FILL, `transaction instanceof cmd.ExecutionCreateCmd`, `execution.execId` = posted. Red before (`transaction was null`) | PASS |
| AC-3 | Query `eventVersion` 3, then 4 after one more event | `ExchangeWorkflowIntegrationTest#queryApi_reportsTheLatestEventVersion`: create, accept, fill (v1–3) → `$.content[0].eventVersion` = 3; second fill → 4. Red before (no `eventVersion`). `QuerySearchIsolationIntegrationTest#search_readsOrdersAndVersionsUnderRepeatableRead` (T-14): a search over HTTP reads the versions inside a REPEATABLE_READ transaction (as Spring declares it and as Postgres reports `current_setting('transaction_isolation')`), so the version belongs to the state on the same page. Red before T-14 (READ COMMITTED, joined from the controller's class-level `@Transactional`) | PASS |
| AC-4 | Snapshot A@3, B@1; live A 2,3,4 and B 3 → only A 4 and B 3 delivered | oms-streaming-service `KafkaEventStreamProviderTest#snapshotDeduplicatesLiveEventsPerOrderByVersion`: StepVerifier expects SNAPSHOT A 3, SNAPSHOT B 1, then exactly UPDATE A 4, UPDATE B 3 and no further event for 300 ms. Both snapshot DTOs carry the same database `id`, so the old `id` matching cannot pass it | PASS |
| AC-5 | Duplicate `commandId` refused (REST 400 FAILED naming C; Kafka acked, not retried or dead-lettered); state, `txNr`, event count unchanged | `OrderLifecycleIntegrationTest#duplicateCommandId_isRefusedOverRestAndLeavesOrderUnchanged`: same cancel request and a cancel reusing the id → each 400, `status` FAILED, message contains `C-AC5`; state, cancelState, `txNr`, event count unchanged. `ExchangeWorkflowIntegrationTest#duplicateCommandId_overKafka_isAcknowledgedNotDeadLettered`: redelivered request plus a cancel reusing the id, then a sentinel on the same partition; event list, `txNr`, cancelState unchanged; no record with the key on `commands.DLT`. Both red before (cross-type reuse applied / 409) | PASS |
| AC-6 | Lifecycle event stores `command_id` = C; a command without id is applied with null | `OrderLifecycleIntegrationTest#lifecycleEvent_storesCommandId_andCommandWithoutIdIsStillApplied`: CXL_REQUEST row `commandId` = `CR-AC6`; cancel reject without id succeeds, CXL_REJ row `commandId` null. Red before | PASS |
| AC-7 | Two concurrent copies → exactly one applied, one event with that `command_id`, other refused as AC-5 | `OrderLifecycleIntegrationTest#concurrentDuplicates_exactlyOneApplied`: two threads released by a latch; exactly one success, the other's message contains `Duplicate command C-AC7`, exactly one event with `C-AC7`. Red 3/3 before the lock (`ObjectOptimisticLockingFailureException`); green 3 runs in a row after | PASS |
| AC-8 | Legacy rows backfilled from `transaction.commandId`; redelivery refused | `CommandIdBackfillMigrationIntegrationTest#legacyEventsAreBackfilled_andRedeliveryIsRefused`: Liquibase `updateToTag(before-006-command-id)`, legacy rows inserted, then Spring applies the rest; v2 `command_id` = `C-LEGACY`, v1 null; reprocessing the request → refused with `Duplicate command C-LEGACY`, event count and cancelState unchanged | PASS |
| AC-9 | `findByRootOrderId(R)` returns 3 descendants without throwing; `findByParentOrderId(R)` exactly the 2 children | `OrderRepositoryTreeIntegrationTest#rootAndParentFinders_returnLists` (Postgres): asserts the id sets {C1, C2, G1} and {C1, C2} and the sizes 3 and 2 | PASS |

## Goal Assessment

The Goal asks for findings 1–5 of the architecture review, section 8:

1. **Key by `orderId` and document every topic's key.** Done: `OrderEventAppender` stages
   executions under the order id, and `interfaces/kafka-topics.md` has a Key column for all three
   topics. `rootOrderId` is explicitly deferred to the tree tickets, as the Goal itself says
   ("once trees exist").
2. **REST fills record their command.** Done; the KB known gap is closed. The REST path still
   takes no SLA ingress time for fills; that was never part of this finding and is still listed as
   a known gap.
3. **Event version in the query DTO, streaming dedup on it.** Done. Implementation also found that
   live events never carried `eventId` (`OrderMessageMapper`), so the old dedup could never have
   matched; fixed and recorded in design.md.
4. **`command_id` column with a unique `(order_id, command_id)` index replacing the history scan.**
   Done, with backfill and a row lock for the concurrent case. Verification also found that Kafka
   lifecycle dedup had never worked in the local build: a stale generated `CommandMessage` dropped
   `commandId` from every Kafka command. That was a build artefact, not a source defect (a clean
   `oms-contracts` build fixes it, and `duplicateCommandId_overKafka…` now proves `commandId` reaches
   the consumer). It is recorded below as a follow-up because the build can regress silently.
5. **`findByRootOrderId` returns a list, plus `findByParentOrderId`.** Done.

Intentionally out of scope, as in the proposal: `rootOrderId` keys, `txNr`/version unification
(SPEC-0027), relay batching (SPEC-0026), new execution-message fields (SPEC-0019).

No material gap between the Goal and what was delivered.

## Policy Review

Reviewed against `git diff` of the SPEC-0018 files plus the untracked new files. The working tree
also holds unrelated uncommitted work from other tickets (developer-cockpit, `docker-compose.yml`
and the LGTM files of SPEC-0031, `oms-core/prometheus.yml`, `readme.txt`). Those are not part of
this ticket and are not judged here.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | Only `oms-contracts/src/main/openapi/oms-query-api.yml` changed; no service-module contract folder |
| P-02 | Specification before code, generated models only | PASS | `OrderDto.eventVersion` added to the spec (T-1) before use; code uses the generated `query.OrderDto` |
| P-03 | Never edit generated code | PASS | Generated sources were only regenerated (`./gradlew clean build`), never edited |
| P-04 | Contracts evolve compatibly | PASS | One optional OpenAPI property. No Avro change. Kafka key change documented; no consumer reads the key |
| P-05 | Every state change is recorded in the event log | PASS | Same events; REST fills now store their command; each event stores `command_id` via `OrderEventAppender` |
| P-06 | Kafka only through the transactional outbox | PASS | Only the staged `aggregateId` changed; `MessagePublisher`/`OutboxRelay` still publish |
| P-07 | Schema changes through new Liquibase changesets | PASS | New `006-order-event-command-id.yaml`, included last; 001–005 untouched; entity mapped; `LiquibaseMigrationIntegrationTest` asserts the constraint; rollback defined |
| P-08 | Concurrency and idempotency are explicit | PASS | Unique `(order_id, command_id)`; indexed dedup; `PESSIMISTIC_WRITE` on lifecycle load with `txNr` kept; per-order version dedup in streaming; duplicate and concurrent-duplicate tests (AC-5, AC-7); orders and versions read in one REPEATABLE_READ snapshot, proven over HTTP by `QuerySearchIsolationIntegrationTest` (T-14) |
| P-09 | Commands and queries stay separate | PASS | Query path reads only: `OrderQueryService.search` is `readOnly = true`, REPEATABLE_READ, and since T-14 `QueryController` no longer opens an outer transaction that would override it; the new repository queries are reads |
| P-10 | State transitions go through the state machine and task pipeline | PASS | Pipeline and task order unchanged; `LoadOrderTask` and `DeduplicateCommandTask` changed only their queries |
| P-11 | Layering and conventions | PASS | Controllers stay thin; version map built in `OrderQueryService`, set in `QueryOrderDtoMapper`; Spring Data derived queries and an interface projection |
| P-12 | Jackson 3 only | PASS | No new Jackson usage |
| P-13 | Errors and validation follow the framework specs | PASS | Duplicate refusal stays `markValidationFailed` → 400 `CommandResult{FAILED}`; Kafka refusal acknowledged; the 409 path is unchanged |
| P-14 | Test first, every AC proven by an automated test | PASS | Every AC has a test above; each was seen red for the right reason first (AC-8: the migration came from T-2, and the test's pass is only possible if the backfill ran after the legacy insert; AC-9: red at compile, the signature is the change) |
| P-15 | Observability | PASS | Duplicate refusal still logs WARN with `commandId` and `orderId`; streaming skip logs at DEBUG with `orderId`, `eventId`, `snapshotVersion` |
| P-16 | Security | N/A | No new input surface, secrets or entitlements |
| P-17 | Simplicity and dependencies | PASS | No new library; smallest change per finding; alternatives in design.md. The tool's WARN on `docker-compose.yml` concerns SPEC-0031's uncommitted change in the same working tree, not this ticket |
| P-18 | Modules build standalone | PASS | `spec verify` built oms-core, oms-contracts, oms-streaming-service, oms-mcp-server and oms-exchange-simulator, all exit 0 |
| P-19 | Documentation follows behaviour | PASS | kafka-topics (keys), booking-integration §3.2, FR-010, NFR-001, order-event, streaming-architecture, real-time-streaming, query-api, execution-processing known gaps |

## Independent Review

**Round 1** (2026-10-31 06:51), one blocking finding:

- **P-08: the search did not run under REPEATABLE_READ.** `QueryController` carried a class-level
  `@Transactional(readOnly = true)`. `OrderQueryService.search` joined that READ COMMITTED
  transaction, so its own `isolation = REPEATABLE_READ` never applied, and a commit between the
  orders read and the versions read could pair an older state with a newer `eventVersion`.
  Confirmed. Fixed by reopening implement: T-14 added `QuerySearchIsolationIntegrationTest` (red:
  READ COMMITTED observed), then removed the controller annotation (green). The order entities have
  no lazy associations, so mapping outside the transaction is safe.

**Round 2** (2026-10-31 07:20), verdict MET, every AC proven, no blocking or major findings.
Three minor ones:

1. **The isolation test proved only the level Spring declared**, not the one Postgres ran. Fixed:
   the stub also reads `current_setting('transaction_isolation')` through `JdbcTemplate` and the test
   asserts `repeatable read`. Re-verified (evidence below).
2. **verification.md cited the evidence from before T-14.** Fixed: Automated Evidence now cites the
   final run.
3. **T-4 said it updated a `CommandControllerWebMvcTest` stub** that does not exist; that test only
   mocks `ExecutionCommandProcessor`. Fixed the T-4 wording. AC-2 stays proven by the integration
   test `restFill_recordsItsCommandInTheEventLog`; no WebMvc test was added.

## Automated Evidence

`evidence/last-run.json`, ran 2026-10-31T07:23:13Z (after T-14 and the review round 2 test fix),
result **pass**, fingerprint `0705826af10317e3`.

| Module | Command | Exit | Log |
|---|---|---|---|
| oms-core | `./gradlew check` | 0 (`test` executed: 37 classes, 191 tests, 0 failures, 0 skipped) | evidence/oms-core-1.log |
| oms-contracts | `./gradlew check` | 0 | evidence/oms-contracts-1.log |
| oms-streaming-service | `./gradlew check` | 0 (`test` UP-TO-DATE: no input changed since its last executed run, 19 tests, 0 failures) | evidence/oms-streaming-service-1.log |
| oms-mcp-server | `./gradlew check` | 0 | evidence/oms-mcp-server-1.log |
| oms-exchange-simulator | `./gradlew check` | 0 | evidence/oms-exchange-simulator-1.log |

Policy check: PASS, no errors, one WARN (`[R10 P-17] docker-compose.yml`, see P-17 above).

The oms-core count includes tests from SPEC-0034's uncommitted work in the same working tree; all
pass. This run was the only build in the tree while it ran.

## Follow-ups

- **oms-contracts Avro generation is not rebuilt when only a referenced `.avsc` changes.**
  `CommandMessage.java` embeds the schemas of its union members; after `commandId` was added to the
  lifecycle commands, the local generated `CommandMessage` kept the old schema, and every Kafka
  lifecycle command lost its `commandId` on the wire. A clean build fixes it. Make generation
  depend on all `.avsc` files (or always clean-generate), so a stale union cannot recur.
- **`ExchangeWorkflowIntegrationTest#replayedCancelRequestAndReject_afterProcessing_haveNoSecondEffect`
  passes by timing.** It waits for PCXL, which the wrongly applied replay also produces, and that
  hid the bug above. It should wait on a sentinel command on the same partition, as the AC-10
  duplicate test does.
- The REST fill path still takes no SLA ingress time (KB known gap in execution-processing).

## Verdict

Verdict: GOAL MET

All nine ACs pass with tests that ran in the final verify run, the only blocking review finding
(round 1, P-08) is fixed and proven, and the Goal assessment has no gap.
